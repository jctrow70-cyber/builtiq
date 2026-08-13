import { parseOffProductForTest } from '../lib/nutrition/barcodeLookup';

const cases = [
  {
    name: '1 tortilla (28 g) with trusted 130 kcal',
    product: {
      product_name: 'Blue Corn Tortillas',
      serving_quantity: 50,
      serving_size: '1 tortilla (28 g)',
      nutriments: {
        'energy-kcal_100g': 220,
        'energy-kcal_serving': 130,
        proteins_100g: 4,
        proteins_serving: 2.4,
      },
    },
    expectCalNear: 130,
  },
  {
    name: 'Bad OFF copy 220=220, label 1 tortilla 28g',
    product: {
      product_name: 'Blue Corn Tortillas',
      serving_quantity: 50,
      serving_size: '1 tortilla (28 g)',
      nutriments: {
        'energy-kcal_100g': 220,
        'energy-kcal_serving': 220,
        proteins_100g: 4,
        proteins_serving: 4,
      },
    },
    expectCalNear: 62,
  },
  {
    name: 'CB Blue Corn — trusted 130 kcal serving',
    product: {
      product_name: 'CB Blue Corn Tortillas',
      serving_quantity: 55,
      serving_size: '2 tortillas (55 g)',
      nutriments: {
        'energy-kcal_100g': 236.363636363636,
        'energy-kcal_serving': 130,
        proteins_100g: 5.45454545454545,
        proteins_serving: 3,
      },
    },
    expectCalNear: 66,
  },
  {
    name: 'CB Blue full serving 55g',
    product: {
      product_name: 'CB Blue Corn Tortillas',
      serving_quantity: 55,
      serving_size: '55 g',
      nutriments: {
        'energy-kcal_100g': 236.363636363636,
        'energy-kcal_serving': 130,
      },
    },
    expectCalNear: 130,
  },
  {
    name: 'Only per 100g, 2 tortilla 50g → per tortilla 25g',
    product: {
      product_name: 'Corn Tortillas',
      serving_quantity: 50,
      serving_size: '2 tortilla (50 g)',
      nutriments: { 'energy-kcal_100g': 220, proteins_100g: 4 },
    },
    expectCalNear: 55,
  },
];

let failed = 0;
for (const c of cases) {
  const r = parseOffProductForTest('test', c.product);
  if (!r.found) {
    console.error('FAIL', c.name, 'not found');
    failed++;
    continue;
  }
  const cal = r.per_serving.calories;
  const grams = r.serving_grams;
  const ok = Math.abs(cal - c.expectCalNear) <= 3;
  console.log(`${ok ? 'OK' : 'FAIL'} ${c.name}: ${cal} cal @ ${grams}g (expected ~${c.expectCalNear})`);
  if (!ok) failed++;
}

if (failed) process.exit(1);
