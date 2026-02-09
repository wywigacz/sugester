/**
 * Generate realistic photo-video product mock data (~200 products)
 * Output: data/mock/products-photo.json
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'data', 'mock', 'products-photo.json');

let idCounter = 0;
function nextId(prefix) {
  return `${prefix}_${String(++idCounter).padStart(4, '0')}`;
}

function randomEan() {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  digits.push((10 - (sum % 10)) % 10);
  return digits.join('');
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - randomBetween(0, daysBack));
  return d.toISOString();
}

function weightedAvailability() {
  const r = Math.random();
  if (r < 0.70) return 'in_stock';
  if (r < 0.85) return 'na_zamowienie';
  return 'out_of_stock';
}

// ============================================================
// PRODUCT DEFINITIONS
// ============================================================

const cameras = [
  // Canon
  { name: 'Canon EOS R5 Mark II', brand: 'Canon', sku: 'CANON-R5-II', model_code: 'EOS R5 Mark II', price: 17999, mount: 'Canon RF', sensor: 'Full Frame', megapixels: 45, video_res: '8K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['nowość', 'profesjonalny', 'pełna klatka'] },
  { name: 'Canon EOS R6 Mark III', brand: 'Canon', sku: 'CANON-R6-III', model_code: 'EOS R6 Mark III', price: 12499, mount: 'Canon RF', sensor: 'Full Frame', megapixels: 24.2, video_res: '4K', video_fps: 120, cat: 'Aparaty bezlusterkowe', tags: ['nowość', 'pełna klatka'] },
  { name: 'Canon EOS R8', brand: 'Canon', sku: 'CANON-R8', model_code: 'EOS R8', price: 7499, mount: 'Canon RF', sensor: 'Full Frame', megapixels: 24.2, video_res: '4K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['pełna klatka', 'budżetowy'] },
  { name: 'Canon EOS R1', brand: 'Canon', sku: 'CANON-R1', model_code: 'EOS R1', price: 29999, mount: 'Canon RF', sensor: 'Full Frame', megapixels: 24.2, video_res: '6K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['profesjonalny', 'flagowiec'] },
  { name: 'Canon EOS R50', brand: 'Canon', sku: 'CANON-R50', model_code: 'EOS R50', price: 3499, mount: 'Canon RF', sensor: 'APS-C', megapixels: 24.2, video_res: '4K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['dla początkującego', 'APS-C'] },
  { name: 'Canon EOS R100', brand: 'Canon', sku: 'CANON-R100', model_code: 'EOS R100', price: 2499, mount: 'Canon RF', sensor: 'APS-C', megapixels: 24.1, video_res: '4K', video_fps: 24, cat: 'Aparaty bezlusterkowe', tags: ['entry-level', 'APS-C'] },
  { name: 'Canon EOS 5D Mark IV', brand: 'Canon', sku: 'CANON-5D4', model_code: 'EOS 5D Mark IV', price: 9999, mount: 'Canon EF', sensor: 'Full Frame', megapixels: 30.4, video_res: '4K', video_fps: 30, cat: 'Lustrzanki cyfrowe', tags: ['profesjonalny', 'pełna klatka', 'DSLR'] },
  // Sony
  { name: 'Sony Alpha 7 IV', brand: 'Sony', sku: 'SONY-A7IV', model_code: 'ILCE-7M4', price: 11999, mount: 'Sony E', sensor: 'Full Frame', megapixels: 33, video_res: '4K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['pełna klatka', 'uniwersalny'] },
  { name: 'Sony Alpha 7R V', brand: 'Sony', sku: 'SONY-A7RV', model_code: 'ILCE-7RM5', price: 18499, mount: 'Sony E', sensor: 'Full Frame', megapixels: 61, video_res: '8K', video_fps: 24, cat: 'Aparaty bezlusterkowe', tags: ['wysoka rozdzielczość', 'pełna klatka'] },
  { name: 'Sony Alpha 1', brand: 'Sony', sku: 'SONY-A1', model_code: 'ILCE-1', price: 28999, mount: 'Sony E', sensor: 'Full Frame', megapixels: 50.1, video_res: '8K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['flagowiec', 'pełna klatka'] },
  { name: 'Sony Alpha 7S III', brand: 'Sony', sku: 'SONY-A7SIII', model_code: 'ILCE-7SM3', price: 14999, mount: 'Sony E', sensor: 'Full Frame', megapixels: 12.1, video_res: '4K', video_fps: 120, cat: 'Aparaty bezlusterkowe', tags: ['wideo', 'niska światłość', 'pełna klatka'] },
  { name: 'Sony Alpha 6700', brand: 'Sony', sku: 'SONY-A6700', model_code: 'ILCE-6700', price: 6499, mount: 'Sony E', sensor: 'APS-C', megapixels: 26, video_res: '4K', video_fps: 120, cat: 'Aparaty bezlusterkowe', tags: ['APS-C', 'wideo'] },
  { name: 'Sony Alpha 6400', brand: 'Sony', sku: 'SONY-A6400', model_code: 'ILCE-6400', price: 3999, mount: 'Sony E', sensor: 'APS-C', megapixels: 24.2, video_res: '4K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['APS-C', 'vlog'] },
  { name: 'Sony ZV-E10 II', brand: 'Sony', sku: 'SONY-ZVE10II', model_code: 'ZV-E10M2', price: 4299, mount: 'Sony E', sensor: 'APS-C', megapixels: 26, video_res: '4K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['vlog', 'APS-C'] },
  // Nikon
  { name: 'Nikon Z6 III', brand: 'Nikon', sku: 'NIKON-Z6III', model_code: 'Z6 III', price: 12499, mount: 'Nikon Z', sensor: 'Full Frame', megapixels: 24.5, video_res: '6K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['nowość', 'pełna klatka'] },
  { name: 'Nikon Z8', brand: 'Nikon', sku: 'NIKON-Z8', model_code: 'Z8', price: 17999, mount: 'Nikon Z', sensor: 'Full Frame', megapixels: 45.7, video_res: '8K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['profesjonalny', 'pełna klatka'] },
  { name: 'Nikon Zf', brand: 'Nikon', sku: 'NIKON-ZF', model_code: 'Zf', price: 9999, mount: 'Nikon Z', sensor: 'Full Frame', megapixels: 24.5, video_res: '4K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['retro', 'pełna klatka', 'styl'] },
  { name: 'Nikon Z50 II', brand: 'Nikon', sku: 'NIKON-Z50II', model_code: 'Z50 II', price: 4999, mount: 'Nikon Z', sensor: 'APS-C', megapixels: 20.9, video_res: '4K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['APS-C', 'nowość'] },
  // Fujifilm
  { name: 'Fujifilm X-T5', brand: 'Fujifilm', sku: 'FUJI-XT5', model_code: 'X-T5', price: 7999, mount: 'Fujifilm X', sensor: 'APS-C', megapixels: 40.2, video_res: '6.2K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['retro', 'APS-C', 'wysoka rozdzielczość'] },
  { name: 'Fujifilm X-H2S', brand: 'Fujifilm', sku: 'FUJI-XH2S', model_code: 'X-H2S', price: 10999, mount: 'Fujifilm X', sensor: 'APS-C', megapixels: 26.1, video_res: '6.2K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['wideo', 'szybki AF'] },
  { name: 'Fujifilm X-S20', brand: 'Fujifilm', sku: 'FUJI-XS20', model_code: 'X-S20', price: 5999, mount: 'Fujifilm X', sensor: 'APS-C', megapixels: 26.1, video_res: '6.2K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['vlog', 'APS-C'] },
  // Panasonic / OM System
  { name: 'Panasonic Lumix S5 IIX', brand: 'Panasonic', sku: 'PANA-S5IIX', model_code: 'DC-S5M2X', price: 10499, mount: 'L-mount', sensor: 'Full Frame', megapixels: 24.2, video_res: '6K', video_fps: 30, cat: 'Aparaty bezlusterkowe', tags: ['wideo', 'pełna klatka'] },
  { name: 'OM System OM-5', brand: 'OM System', sku: 'OMS-OM5', model_code: 'OM-5', price: 5499, mount: 'Micro 4/3', sensor: 'Micro 4/3', megapixels: 20, video_res: '4K', video_fps: 60, cat: 'Aparaty bezlusterkowe', tags: ['kompaktowy', 'odporny'] },
];

const lenses = [
  // Canon RF
  { name: 'Canon RF 70-200mm f/2.8L IS USM', brand: 'Canon', sku: 'CANON-RF70200', price: 11999, mount: 'Canon RF', sensor_coverage: 'Full Frame', focal_min: 70, focal_max: 200, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['profesjonalny', 'teleobiektyw', 'L-series'] },
  { name: 'Canon RF 24-70mm f/2.8L IS USM', brand: 'Canon', sku: 'CANON-RF2470', price: 10499, mount: 'Canon RF', sensor_coverage: 'Full Frame', focal_min: 24, focal_max: 70, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['profesjonalny', 'uniwersalny', 'L-series'] },
  { name: 'Canon RF 50mm f/1.8 STM', brand: 'Canon', sku: 'CANON-RF50', price: 999, mount: 'Canon RF', sensor_coverage: 'Full Frame', focal_min: 50, focal_max: 50, aperture: '1.8', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'budżetowy', 'nifty fifty'] },
  { name: 'Canon RF 85mm f/1.2L USM', brand: 'Canon', sku: 'CANON-RF85', price: 12999, mount: 'Canon RF', sensor_coverage: 'Full Frame', focal_min: 85, focal_max: 85, aperture: '1.2', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'profesjonalny'] },
  { name: 'Canon RF 15-35mm f/2.8L IS USM', brand: 'Canon', sku: 'CANON-RF1535', price: 10299, mount: 'Canon RF', sensor_coverage: 'Full Frame', focal_min: 15, focal_max: 35, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['szeroki kąt', 'L-series'] },
  { name: 'Canon RF-S 18-150mm f/3.5-6.3 IS STM', brand: 'Canon', sku: 'CANON-RFS18150', price: 2199, mount: 'Canon RF', sensor_coverage: 'APS-C', focal_min: 18, focal_max: 150, aperture: '3.5', type: 'zoom', cat: 'Obiektywy', tags: ['uniwersalny', 'APS-C', 'travel'] },
  // Sony FE
  { name: 'Sony FE 24-70mm f/2.8 GM II', brand: 'Sony', sku: 'SONY-FE2470GM2', price: 10499, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 24, focal_max: 70, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['G Master', 'profesjonalny'] },
  { name: 'Sony FE 70-200mm f/2.8 GM OSS II', brand: 'Sony', sku: 'SONY-FE70200GM2', price: 12999, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 70, focal_max: 200, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['G Master', 'teleobiektyw'] },
  { name: 'Sony FE 85mm f/1.4 GM', brand: 'Sony', sku: 'SONY-FE85GM', price: 7999, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 85, focal_max: 85, aperture: '1.4', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'G Master'] },
  { name: 'Sony FE 50mm f/1.8', brand: 'Sony', sku: 'SONY-FE50', price: 1099, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 50, focal_max: 50, aperture: '1.8', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'budżetowy'] },
  { name: 'Sony FE 35mm f/1.4 GM', brand: 'Sony', sku: 'SONY-FE35GM', price: 6499, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 35, focal_max: 35, aperture: '1.4', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['reportaż', 'G Master'] },
  { name: 'Sony E 10-18mm f/4 OSS', brand: 'Sony', sku: 'SONY-E1018', price: 3499, mount: 'Sony E', sensor_coverage: 'APS-C', focal_min: 10, focal_max: 18, aperture: '4', type: 'zoom', cat: 'Obiektywy', tags: ['ultraszeroki', 'APS-C'] },
  // Nikon Z
  { name: 'Nikon NIKKOR Z 24-70mm f/2.8 S', brand: 'Nikon', sku: 'NIKON-Z2470', price: 9499, mount: 'Nikon Z', sensor_coverage: 'Full Frame', focal_min: 24, focal_max: 70, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['S-line', 'profesjonalny'] },
  { name: 'Nikon NIKKOR Z 70-200mm f/2.8 VR S', brand: 'Nikon', sku: 'NIKON-Z70200', price: 11499, mount: 'Nikon Z', sensor_coverage: 'Full Frame', focal_min: 70, focal_max: 200, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['S-line', 'teleobiektyw'] },
  { name: 'Nikon NIKKOR Z 50mm f/1.8 S', brand: 'Nikon', sku: 'NIKON-Z50F18', price: 2499, mount: 'Nikon Z', sensor_coverage: 'Full Frame', focal_min: 50, focal_max: 50, aperture: '1.8', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['S-line', 'portret'] },
  // Sigma
  { name: 'Sigma 35mm f/1.4 DG DN Art Sony E', brand: 'Sigma', sku: 'SIGMA-35ART-SE', price: 3499, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 35, focal_max: 35, aperture: '1.4', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['Art', 'reportaż'] },
  { name: 'Sigma 24-70mm f/2.8 DG DN Art Sony E', brand: 'Sigma', sku: 'SIGMA-2470-SE', price: 4999, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 24, focal_max: 70, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['Art', 'uniwersalny'] },
  { name: 'Sigma 70-200mm f/2.8 DG DN OS Sports Sony E', brand: 'Sigma', sku: 'SIGMA-70200-SE', price: 6499, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 70, focal_max: 200, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['Sports', 'teleobiektyw'] },
  { name: 'Sigma 150-600mm f/5-6.3 DG DN OS Sports Sony E', brand: 'Sigma', sku: 'SIGMA-150600-SE', price: 6999, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 150, focal_max: 600, aperture: '5', type: 'zoom', cat: 'Obiektywy', tags: ['Sports', 'supertelephoto', 'wildlife'] },
  { name: 'Sigma 35mm f/1.4 DG DN Art L-mount', brand: 'Sigma', sku: 'SIGMA-35ART-L', price: 3499, mount: 'L-mount', sensor_coverage: 'Full Frame', focal_min: 35, focal_max: 35, aperture: '1.4', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['Art', 'reportaż'] },
  { name: 'Sigma 18-50mm f/2.8 DC DN Contemporary Sony E', brand: 'Sigma', sku: 'SIGMA-1850-SE', price: 2299, mount: 'Sony E', sensor_coverage: 'APS-C', focal_min: 18, focal_max: 50, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['Contemporary', 'APS-C'] },
  // Tamron
  { name: 'Tamron 28-75mm f/2.8 Di III VXD G2 Sony E', brand: 'Tamron', sku: 'TAMRON-2875-G2', price: 3999, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 28, focal_max: 75, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['uniwersalny', 'budżetowy'] },
  { name: 'Tamron 70-180mm f/2.8 Di III VC VXD G2 Sony E', brand: 'Tamron', sku: 'TAMRON-70180-G2', price: 5499, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 70, focal_max: 180, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['teleobiektyw', 'kompaktowy'] },
  // Viltrox
  { name: 'Viltrox AF 85mm f/1.8 II Sony E', brand: 'Viltrox', sku: 'VILTROX-85-SE', price: 1299, mount: 'Sony E', sensor_coverage: 'Full Frame', focal_min: 85, focal_max: 85, aperture: '1.8', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'budżetowy'] },
  { name: 'Viltrox AF 56mm f/1.4 Fuji X', brand: 'Viltrox', sku: 'VILTROX-56-FX', price: 999, mount: 'Fujifilm X', sensor_coverage: 'APS-C', focal_min: 56, focal_max: 56, aperture: '1.4', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'budżetowy', 'APS-C'] },
  // Fujifilm
  { name: 'Fujifilm XF 56mm f/1.2 R WR', brand: 'Fujifilm', sku: 'FUJI-XF56', price: 4999, mount: 'Fujifilm X', sensor_coverage: 'APS-C', focal_min: 56, focal_max: 56, aperture: '1.2', type: 'stałoogniskowy', cat: 'Obiektywy', tags: ['portret', 'premium'] },
  { name: 'Fujifilm XF 18-55mm f/2.8-4 R LM OIS', brand: 'Fujifilm', sku: 'FUJI-XF1855', price: 3299, mount: 'Fujifilm X', sensor_coverage: 'APS-C', focal_min: 18, focal_max: 55, aperture: '2.8', type: 'zoom', cat: 'Obiektywy', tags: ['kit', 'uniwersalny'] },
];

const tripods = [
  { name: 'Manfrotto MT055CXPRO4 statyw karbonowy', brand: 'Manfrotto', sku: 'MAN-055CX', price: 2999, max_load: 9, max_height: 170, material: 'Carbon', cat: 'Statywy', tags: ['karbonowy', 'profesjonalny'] },
  { name: 'Manfrotto MT190XPRO4 statyw aluminiowy', brand: 'Manfrotto', sku: 'MAN-190X', price: 1499, max_load: 7, max_height: 160, material: 'Aluminium', cat: 'Statywy', tags: ['aluminiowy'] },
  { name: 'Manfrotto Befree Advanced statyw podróżny', brand: 'Manfrotto', sku: 'MAN-BEFREE', price: 999, max_load: 8, max_height: 150, material: 'Aluminium', cat: 'Statywy', tags: ['podróżny', 'kompaktowy'] },
  { name: 'Benro Mach3 TMA38CL statyw karbonowy', brand: 'Benro', sku: 'BENRO-TMA38', price: 2499, max_load: 16, max_height: 175, material: 'Carbon', cat: 'Statywy', tags: ['karbonowy', 'wytrzymały'] },
  { name: 'Gitzo Mountaineer GT3543LS statyw karbonowy', brand: 'Gitzo', sku: 'GITZO-GT3543', price: 5999, max_load: 21, max_height: 164, material: 'Carbon', cat: 'Statywy', tags: ['karbonowy', 'premium', 'profesjonalny'] },
  { name: 'Sirui T-2204X statyw karbonowy', brand: 'Sirui', sku: 'SIRUI-T2204', price: 1799, max_load: 12, max_height: 152, material: 'Carbon', cat: 'Statywy', tags: ['karbonowy', 'budżetowy'] },
  { name: 'Peak Design Travel Tripod statyw karbonowy', brand: 'Peak Design', sku: 'PD-TRAVEL-C', price: 3299, max_load: 9.1, max_height: 152, material: 'Carbon', cat: 'Statywy', tags: ['podróżny', 'kompaktowy', 'premium'] },
  { name: 'Manfrotto MVH502AH głowica wideo', brand: 'Manfrotto', sku: 'MAN-502AH', price: 999, max_load: 7, max_height: 0, material: 'Aluminium', cat: 'Głowice statywowe', tags: ['wideo', 'głowica'] },
  { name: 'Benro S8 głowica wideo', brand: 'Benro', sku: 'BENRO-S8', price: 1299, max_load: 8, max_height: 0, material: 'Aluminium', cat: 'Głowice statywowe', tags: ['wideo', 'głowica'] },
  { name: 'Sirui Monopod P-326S monopod karbonowy', brand: 'Sirui', sku: 'SIRUI-P326S', price: 599, max_load: 10, max_height: 155, material: 'Carbon', cat: 'Statywy', tags: ['monopod', 'karbonowy'] },
];

const flashes = [
  { name: 'Godox V1-C lampa błyskowa Canon', brand: 'Godox', sku: 'GODOX-V1C', price: 1199, compatible_mount: 'Canon', guide_number: 76, cat: 'Lampy błyskowe', tags: ['reporterska', 'TTL', 'HSS'] },
  { name: 'Godox V1-S lampa błyskowa Sony', brand: 'Godox', sku: 'GODOX-V1S', price: 1199, compatible_mount: 'Sony', guide_number: 76, cat: 'Lampy błyskowe', tags: ['reporterska', 'TTL', 'HSS'] },
  { name: 'Godox V1-N lampa błyskowa Nikon', brand: 'Godox', sku: 'GODOX-V1N', price: 1199, compatible_mount: 'Nikon', guide_number: 76, cat: 'Lampy błyskowe', tags: ['reporterska', 'TTL', 'HSS'] },
  { name: 'Godox V860III-C lampa błyskowa Canon', brand: 'Godox', sku: 'GODOX-V860C', price: 899, compatible_mount: 'Canon', guide_number: 60, cat: 'Lampy błyskowe', tags: ['reporterska', 'TTL'] },
  { name: 'Godox AD200 Pro lampa studyjna przenośna', brand: 'Godox', sku: 'GODOX-AD200P', price: 1599, compatible_mount: 'uniwersalny', guide_number: 52, cat: 'Lampy błyskowe', tags: ['studyjna', 'przenośna'] },
  { name: 'Godox AD600 Pro lampa studyjna', brand: 'Godox', sku: 'GODOX-AD600P', price: 4999, compatible_mount: 'uniwersalny', guide_number: 87, cat: 'Oświetlenie studyjne', tags: ['studyjna', 'profesjonalny'] },
  { name: 'Profoto A2 lampa błyskowa', brand: 'Profoto', sku: 'PROFOTO-A2', price: 5999, compatible_mount: 'uniwersalny', guide_number: 76, cat: 'Lampy błyskowe', tags: ['premium', 'studyjna'] },
  { name: 'Godox SL-150 III świetło ciągłe LED', brand: 'Godox', sku: 'GODOX-SL150III', price: 1299, compatible_mount: 'uniwersalny', guide_number: 0, cat: 'Oświetlenie studyjne', tags: ['LED', 'światło ciągłe', 'wideo'] },
  { name: 'Aputure 60x softbox', brand: 'Aputure', sku: 'APUTURE-60X', price: 699, compatible_mount: 'Bowens', guide_number: 0, cat: 'Akcesoria oświetleniowe', tags: ['softbox', 'modyfikator'] },
];

const memoryCards = [
  { name: 'SanDisk Extreme Pro SDXC 128GB 200MB/s', brand: 'SanDisk', sku: 'SDISK-EP128', price: 129, cat: 'Karty pamięci', tags: ['SD', 'UHS-I'] },
  { name: 'SanDisk Extreme Pro SDXC 256GB 200MB/s', brand: 'SanDisk', sku: 'SDISK-EP256', price: 229, cat: 'Karty pamięci', tags: ['SD', 'UHS-I'] },
  { name: 'SanDisk Extreme Pro CFexpress Type B 128GB', brand: 'SanDisk', sku: 'SDISK-CFE128', price: 599, cat: 'Karty pamięci', tags: ['CFexpress', 'profesjonalny'] },
  { name: 'SanDisk Extreme Pro CFexpress Type A 160GB', brand: 'SanDisk', sku: 'SDISK-CFA160', price: 899, cat: 'Karty pamięci', tags: ['CFexpress Type A', 'Sony'] },
  { name: 'Lexar Professional 1066x SDXC 128GB', brand: 'Lexar', sku: 'LEXAR-1066-128', price: 99, cat: 'Karty pamięci', tags: ['SD', 'UHS-I'] },
  { name: 'Lexar Professional CFexpress Type B 256GB', brand: 'Lexar', sku: 'LEXAR-CFE256', price: 799, cat: 'Karty pamięci', tags: ['CFexpress', 'profesjonalny'] },
  { name: 'Sony CEA-G80T CFexpress Type A 80GB', brand: 'Sony', sku: 'SONY-CEAG80', price: 599, cat: 'Karty pamięci', tags: ['CFexpress Type A', 'Sony'] },
  { name: 'Kingston Canvas React Plus SDXC 256GB V60', brand: 'Kingston', sku: 'KING-CRP256', price: 179, cat: 'Karty pamięci', tags: ['SD', 'V60'] },
];

const bags = [
  { name: 'Lowepro ProTactic BP 450 AW II plecak fotograficzny', brand: 'Lowepro', sku: 'LOW-PT450', price: 999, cat: 'Torby i plecaki foto', tags: ['plecak', 'profesjonalny'] },
  { name: 'Lowepro Adventura SH 140 III torba na aparat', brand: 'Lowepro', sku: 'LOW-ADV140', price: 179, cat: 'Torby i plecaki foto', tags: ['torba', 'kompaktowa'] },
  { name: 'Peak Design Everyday Backpack V2 20L czarny', brand: 'Peak Design', sku: 'PD-EDBP20-BK', price: 1199, cat: 'Torby i plecaki foto', tags: ['plecak', 'premium', 'miejski'] },
  { name: 'Peak Design Everyday Sling 6L', brand: 'Peak Design', sku: 'PD-EDSLING6', price: 599, cat: 'Torby i plecaki foto', tags: ['sling', 'kompaktowy'] },
  { name: 'Manfrotto Advanced Befree Messenger torba', brand: 'Manfrotto', sku: 'MAN-MSGR', price: 449, cat: 'Torby i plecaki foto', tags: ['torba', 'messenger'] },
  { name: 'Think Tank Photo Airport Essentials plecak', brand: 'Think Tank', sku: 'TT-APE', price: 799, cat: 'Torby i plecaki foto', tags: ['plecak', 'podróżny'] },
  { name: 'Vanguard VEO SELECT 46BR plecak', brand: 'Vanguard', sku: 'VAN-VEOSEL46', price: 549, cat: 'Torby i plecaki foto', tags: ['plecak', 'budżetowy'] },
];

const filters = [
  { name: 'Hoya HD CIR-PL 77mm filtr polaryzacyjny', brand: 'Hoya', sku: 'HOYA-CPL77', price: 299, diameter: 77, filter_type: 'CPL', cat: 'Filtry optyczne', tags: ['polaryzacyjny', 'CPL'] },
  { name: 'Hoya HD CIR-PL 82mm filtr polaryzacyjny', brand: 'Hoya', sku: 'HOYA-CPL82', price: 349, diameter: 82, filter_type: 'CPL', cat: 'Filtry optyczne', tags: ['polaryzacyjny', 'CPL'] },
  { name: 'Hoya ProND 1000 77mm filtr szary', brand: 'Hoya', sku: 'HOYA-ND1000-77', price: 249, diameter: 77, filter_type: 'ND', cat: 'Filtry optyczne', tags: ['ND', 'szary', 'długa ekspozycja'] },
  { name: 'B+W XS-Pro Digital ND Vario 77mm MRC nano', brand: 'B+W', sku: 'BW-NDVARIO77', price: 599, diameter: 77, filter_type: 'ND', cat: 'Filtry optyczne', tags: ['ND', 'zmienny', 'premium'] },
  { name: 'NiSi V6 zestaw filtrów 100mm + CPL', brand: 'NiSi', sku: 'NISI-V6-KIT', price: 1899, diameter: 100, filter_type: 'system', cat: 'Filtry optyczne', tags: ['system filtrów', 'profesjonalny'] },
  { name: 'Hoya UV Fusion One 67mm filtr UV', brand: 'Hoya', sku: 'HOYA-UV67', price: 99, diameter: 67, filter_type: 'UV', cat: 'Filtry optyczne', tags: ['UV', 'ochronny'] },
  { name: 'K&F Concept ND2-ND400 58mm filtr szary zmienny', brand: 'K&F Concept', sku: 'KF-NDVAR58', price: 99, diameter: 58, filter_type: 'ND', cat: 'Filtry optyczne', tags: ['ND', 'zmienny', 'budżetowy'] },
];

const accessories = [
  { name: 'Canon LP-E6NH akumulator', brand: 'Canon', sku: 'CANON-LPE6NH', price: 349, cat: 'Akumulatory i zasilanie', tags: ['bateria', 'Canon'] },
  { name: 'Sony NP-FZ100 akumulator', brand: 'Sony', sku: 'SONY-NPFZ100', price: 299, cat: 'Akumulatory i zasilanie', tags: ['bateria', 'Sony'] },
  { name: 'Nikon EN-EL15c akumulator', brand: 'Nikon', sku: 'NIKON-ENEL15C', price: 299, cat: 'Akumulatory i zasilanie', tags: ['bateria', 'Nikon'] },
  { name: 'Newell DL-USB-C ładowarka dwukanałowa Canon LP-E6', brand: 'Newell', sku: 'NEWELL-LPE6CH', price: 99, cat: 'Akumulatory i zasilanie', tags: ['ładowarka', 'Canon'] },
  { name: 'Canon RC-6 pilot zdalny bezprzewodowy', brand: 'Canon', sku: 'CANON-RC6', price: 99, cat: 'Akcesoria', tags: ['pilot', 'zdalny', 'Canon'] },
  { name: 'Peak Design Slide Lite pasek do aparatu', brand: 'Peak Design', sku: 'PD-SLIDELITE', price: 249, cat: 'Akcesoria', tags: ['pasek', 'premium'] },
  { name: 'Peak Design Capture Clip V3 uchwyt do paska', brand: 'Peak Design', sku: 'PD-CAPV3', price: 349, cat: 'Akcesoria', tags: ['uchwyt', 'clip'] },
  { name: 'LENSPEN NLP-1 czyścik do obiektywów', brand: 'Lenspen', sku: 'LP-NLP1', price: 49, cat: 'Czyszczenie', tags: ['czyszczenie', 'obiektyw'] },
  { name: 'Zestaw czyszczący VSGO 9-elementowy', brand: 'VSGO', sku: 'VSGO-KIT9', price: 129, cat: 'Czyszczenie', tags: ['czyszczenie', 'zestaw'] },
  { name: 'SmallRig klatka do Sony A7 IV', brand: 'SmallRig', sku: 'SR-A7IV-CAGE', price: 449, cat: 'Akcesoria wideo', tags: ['cage', 'klatka', 'Sony', 'wideo'] },
  { name: 'DJI RS 4 gimbal', brand: 'DJI', sku: 'DJI-RS4', price: 2499, cat: 'Stabilizatory', tags: ['gimbal', 'stabilizator', 'wideo'] },
  { name: 'DJI RS 3 Mini gimbal', brand: 'DJI', sku: 'DJI-RS3MINI', price: 1699, cat: 'Stabilizatory', tags: ['gimbal', 'stabilizator', 'kompaktowy'] },
  // Drony
  { name: 'DJI Mini 4 Pro dron', brand: 'DJI', sku: 'DJI-MINI4PRO', price: 3999, cat: 'Drony', tags: ['dron', 'kompaktowy', '4K'] },
  { name: 'DJI Air 3S dron', brand: 'DJI', sku: 'DJI-AIR3S', price: 5499, cat: 'Drony', tags: ['dron', '4K', 'podwójny aparat'] },
  { name: 'DJI Mavic 3 Pro dron', brand: 'DJI', sku: 'DJI-MAV3PRO', price: 9999, cat: 'Drony', tags: ['dron', 'profesjonalny', 'Hasselblad'] },
  // Kamerki sportowe
  { name: 'GoPro HERO 13 Black kamera sportowa', brand: 'GoPro', sku: 'GOPRO-HERO13', price: 1999, cat: 'Kamery sportowe', tags: ['action camera', '5.3K'] },
  { name: 'DJI Osmo Action 5 Pro kamera sportowa', brand: 'DJI', sku: 'DJI-OA5PRO', price: 1799, cat: 'Kamery sportowe', tags: ['action camera', '4K'] },
  { name: 'Insta360 X4 kamera 360', brand: 'Insta360', sku: 'I360-X4', price: 2499, cat: 'Kamery sportowe', tags: ['360', '8K', 'panorama'] },
  // Adaptery
  { name: 'Canon EF-EOS R adapter bagnetowy', brand: 'Canon', sku: 'CANON-EFEOSR', price: 499, cat: 'Adaptery', tags: ['adapter', 'Canon EF', 'Canon RF'] },
  { name: 'Sigma MC-11 adapter Canon EF na Sony E', brand: 'Sigma', sku: 'SIGMA-MC11', price: 999, cat: 'Adaptery', tags: ['adapter', 'Canon EF', 'Sony E'] },
];

// ============================================================
// BUILD PRODUCTS
// ============================================================

function buildProduct(raw, category_override) {
  const id = nextId('prod');
  const availability = weightedAvailability();
  const sales = availability === 'in_stock' ? randomBetween(0, 500) : randomBetween(0, 50);
  const isPromo = Math.random() < 0.2;
  const salePrice = isPromo ? Math.round(raw.price * randomFloat(0.8, 0.95, 2)) : null;
  const isNew = Math.random() < 0.15;
  const hasImage = Math.random() < 0.95;
  const marginPct = randomFloat(5, 40);

  const product = {
    id,
    sku: raw.sku,
    ean: randomEan(),
    manufacturer_code: raw.model_code || raw.sku,
    model_code: raw.model_code || null,
    name: raw.name,
    description: raw.description || `${raw.name} - profesjonalny sprzęt fotograficzny marki ${raw.brand}. Idealne rozwiązanie dla wymagających fotografów i filmowców.`,
    brand: raw.brand,
    category: raw.cat || category_override,
    category_path: raw.cat || category_override,
    category_id: (raw.cat || category_override).toLowerCase().replace(/\s+/g, '-').replace(/[ąćęłńóśźż]/g, c => ({ą:'a',ć:'c',ę:'e',ł:'l',ń:'n',ó:'o',ś:'s',ź:'z',ż:'z'}[c] || c)),
    tags: raw.tags || [],
    price: raw.price,
    sale_price: salePrice,
    is_promo: isPromo,
    currency: 'PLN',
    availability,
    image_url: hasImage ? `https://placeholder.example.com/products/${raw.sku.toLowerCase()}.jpg` : null,
    product_url: `https://example-store.pl/product/${raw.sku.toLowerCase()}`,
    has_image: hasImage,
    sales_30d: sales,
    margin_pct: marginPct,
    is_new: isNew,
    is_high_margin: marginPct > 25,
    avg_rating: randomFloat(3.5, 5.0, 1),
    review_count: randomBetween(0, 200),
    created_at: randomDate(isNew ? 60 : 730),
    updated_at: new Date().toISOString(),
    params: {},
    compatible_with: [],
    compatible_mounts: [],
  };

  // Lens-specific params
  if (raw.focal_min !== undefined) {
    product.params.focal_length_min = raw.focal_min;
    product.params.focal_length_max = raw.focal_max;
    product.params.aperture = raw.aperture;
    product.params.mount = raw.mount;
    product.params.sensor_size = raw.sensor_coverage;
    product.compatible_mounts = [raw.mount];
  }

  // Camera-specific params
  if (raw.megapixels) {
    product.params.megapixels = raw.megapixels;
    product.params.sensor_size = raw.sensor;
    product.params.mount = raw.mount;
    product.params.video_resolution = raw.video_res;
    product.params.video_fps = raw.video_fps;
    product.compatible_mounts = [raw.mount];
  }

  // Tripod-specific params
  if (raw.max_load !== undefined) {
    product.params.max_load_kg = raw.max_load;
    product.params.max_height_cm = raw.max_height;
    product.params.material = raw.material;
  }

  // Filter-specific params
  if (raw.diameter) {
    product.params.filter_diameter = raw.diameter;
  }

  // Suggest field for completion suggester
  const suggestInputs = [raw.name, raw.brand, raw.sku];
  if (raw.model_code) suggestInputs.push(raw.model_code);
  product.suggest = {
    input: suggestInputs,
    contexts: {
      category: [product.category],
    },
  };

  return product;
}

// ============================================================
// GENERATE ALL PRODUCTS
// ============================================================

const allProducts = [
  ...cameras.map(c => buildProduct(c)),
  ...lenses.map(l => buildProduct(l)),
  ...tripods.map(t => buildProduct(t)),
  ...flashes.map(f => buildProduct(f)),
  ...memoryCards.map(m => buildProduct(m)),
  ...bags.map(b => buildProduct(b)),
  ...filters.map(f => buildProduct(f)),
  ...accessories.map(a => buildProduct(a)),
];

// Write output
writeFileSync(OUTPUT_PATH, JSON.stringify(allProducts, null, 2), 'utf-8');
console.log(`Generated ${allProducts.length} products → ${OUTPUT_PATH}`);
