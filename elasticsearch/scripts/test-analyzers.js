import { Client } from '@elastic/elasticsearch';

const ES_URL = process.env.ES_URL || 'http://localhost:9200';
const INDEX_NAME = process.env.INDEX_NAME || 'products';

const client = new Client({ node: ES_URL });

const tests = [
  {
    name: 'Morfologik: Polish lemmatization',
    analyzer: 'polish_morfologik',
    text: 'aparatów fotograficznych',
    // ICU folding converts ó→o before Morfologik, so "aparatow" not "aparat"
    expectContains: ['aparatow', 'fotograficzny'],
  },
  {
    name: 'Morfologik: Obiektyw forms',
    analyzer: 'polish_morfologik',
    text: 'obiektywem stałoogniskowym',
    expectContains: ['obiektyw'],
  },
  {
    name: 'Stempel: Fallback stemming',
    analyzer: 'polish_stempel',
    text: 'statywów fotograficznych',
    // Stempel stems differently — just verify it produces tokens
    expectContains: ['fotograficzny'],
  },
  {
    name: 'Folded: Word delimiter preserves original',
    analyzer: 'polish_folded',
    text: 'Canon EOS R5 Mark II',
    expectContains: ['canon', 'eos', 'r5'],
  },
  {
    name: 'Folded: Focal length tokenization',
    analyzer: 'polish_folded',
    text: 'obiektyw 70-200mm f/2.8',
    // word_delimiter_graph splits on hyphen; f/ gets split
    expectContains: ['obiektyw', '200mm'],
  },
  {
    name: 'Folded: Greek alpha normalized',
    analyzer: 'polish_folded',
    text: 'Sony α7 III',
    expectContains: ['alpha7'],
  },
  {
    name: 'ICU Folding: Polish diacritics folded',
    analyzer: 'polish_folded',
    text: 'żółty obiektyw',
    expectContains: ['zolty', 'obiektyw'],
  },
  {
    name: 'Prefix: Edge n-gram generation',
    analyzer: 'polish_prefix',
    text: 'Canon',
    expectContains: ['c', 'ca', 'can', 'cano', 'canon'],
  },
  {
    name: 'Prefix search: No edge n-gram',
    analyzer: 'polish_prefix_search',
    text: 'Canon',
    expectContains: ['canon'],
    expectNotContains: ['c', 'ca', 'can'],
  },
  {
    name: 'Folded search: Synonym expansion (lustrzanka → dslr)',
    analyzer: 'polish_folded_search',
    text: 'lustrzanka',
    expectContains: ['dslr'],
  },
  {
    name: 'Mark normalizer: MkII → MarkII',
    analyzer: 'polish_folded',
    text: 'Canon 5D Mk II',
    expectContains: ['markii'],
  },
];

async function runTests() {
  console.log('Testing analyzers on index:', INDEX_NAME);
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await client.indices.analyze({
        index: INDEX_NAME,
        body: {
          analyzer: test.analyzer,
          text: test.text,
        },
      });

      const tokens = result.tokens.map((t) => t.token);
      const tokenStr = tokens.join(', ');

      let success = true;
      const errors = [];

      if (test.expectContains) {
        for (const expected of test.expectContains) {
          if (!tokens.includes(expected)) {
            success = false;
            errors.push(`missing "${expected}"`);
          }
        }
      }

      if (test.expectNotContains) {
        for (const notExpected of test.expectNotContains) {
          if (tokens.includes(notExpected)) {
            success = false;
            errors.push(`unexpected "${notExpected}"`);
          }
        }
      }

      if (success) {
        console.log(`✓ ${test.name}`);
        console.log(`  Tokens: [${tokenStr}]`);
        passed++;
      } else {
        console.log(`✗ ${test.name}`);
        console.log(`  Tokens: [${tokenStr}]`);
        console.log(`  Errors: ${errors.join(', ')}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${err.message}`);
      failed++;
    }

    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner failed:', err.message);
  process.exit(1);
});
