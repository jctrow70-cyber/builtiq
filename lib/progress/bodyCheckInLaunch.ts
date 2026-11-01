export type BodyCheckInLaunch = {
  id: number;
  openForm: true;
};

/** Scroll the existing Progress Body check-in form once per launch id. */
export function shouldOpenBodyCheckIn(launch: BodyCheckInLaunch | null | undefined, consumedId: number | null): boolean {
  if (!launch?.openForm) return false;
  return consumedId !== launch.id;
}
