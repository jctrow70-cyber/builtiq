/**
 * Tiny PostgreSQL simple-query client for the disposable Stage 2 database.
 * The embedded server binaries do not include psql.exe.
 */
import net from 'node:net';

type QueryResult = { rows: Array<Array<string | null>> };

function int32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function startup(user: string, database: string) {
  const body = Buffer.concat([
    int32(196608),
    Buffer.from(`user\0${user}\0database\0${database}\0\0`, 'utf8'),
  ]);
  return Buffer.concat([int32(body.length + 4), body]);
}

function queryMessage(sql: string) {
  const text = Buffer.from(`${sql}\0`, 'utf8');
  return Buffer.concat([Buffer.from('Q'), int32(text.length + 4), text]);
}

export function pgQuery(input: {
  host: string;
  port: number;
  user: string;
  database: string;
  sql: string;
  timeoutMs?: number;
}): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: input.host, port: input.port });
    let buffer = Buffer.alloc(0);
    let startupDone = false;
    let settled = false;
    const rows: Array<Array<string | null>> = [];
    let failed = '';

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve({ rows });
    };

    const handle = () => {
      while (buffer.length >= 5) {
        const type = String.fromCharCode(buffer[0]);
        const length = buffer.readInt32BE(1);
        if (length < 4) {
          finish(new Error('PostgreSQL sent a truncated message'));
          return;
        }
        if (buffer.length < length + 1) return;
        const frame = Buffer.from(buffer.subarray(0, length + 1));
        buffer = Buffer.from(buffer.subarray(length + 1));
        const payload = frame.subarray(5);
        if (type === 'E') {
          let text = '';
          let offset = 0;
          while (offset < payload.length) {
            const code = String.fromCharCode(payload[offset]);
            offset += 1;
            if (code === '\0') break;
            const end = payload.indexOf(0, offset);
            if (end < 0) break;
            const value = payload.subarray(offset, end).toString('utf8');
            if (code === 'M') text = value;
            offset = end + 1;
          }
          failed = text || 'PostgreSQL error';
        } else if (type === 'D') {
          const count = payload.readInt16BE(0);
          let offset = 2;
          const row: Array<string | null> = [];
          for (let index = 0; index < count; index += 1) {
            const size = payload.readInt32BE(offset);
            offset += 4;
            if (size < 0) row.push(null);
            else {
              row.push(payload.subarray(offset, offset + size).toString('utf8'));
              offset += size;
            }
          }
          rows.push(row);
        } else if (type === 'Z') {
          if (!startupDone) {
            startupDone = true;
            if (failed) {
              finish(new Error(failed));
              return;
            }
            socket.write(queryMessage(input.sql));
          } else {
            finish(failed ? new Error(failed) : undefined);
            return;
          }
        } else if (type === 'R') {
          if (payload.length < 4) {
            finish(new Error('PostgreSQL authentication message was truncated'));
            return;
          }
          const code = payload.readInt32BE(0);
          if (code !== 0) {
            finish(new Error(`PostgreSQL authentication was not trusted (${code})`));
            return;
          }
        }
      }
    };

    socket.setTimeout(input.timeoutMs ?? 120000, () => finish(new Error('PostgreSQL query timed out')));
    socket.on('connect', () => socket.write(startup(input.user, input.database)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      handle();
    });
    socket.on('error', (error) => finish(error));
    socket.on('close', () => {
      if (!settled) finish(new Error(failed || 'PostgreSQL connection closed'));
    });
  });
}
