import { randomBytes } from 'node:crypto'
import { hashPassword } from '../auth/passwords.js'
import { emptyState } from '../db.js'
import { today } from '../domain/cycle.js'
import { tagFor } from '../domain/slots.js'

// Every seeded household already has a PIN, as though the shop had set one at
// the counter. Derived from the card number so it survives a reseed — a
// household is not asked to memorise a new PIN every time the demo resets.
export const cardPin = (number) => {
  let h = 0
  for (const ch of String(number)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const pin = String(h % 10000).padStart(4, '0')
  // Never hand out a PIN the setter would itself reject.
  return WEAK_DEMO_PINS.has(pin) ? String((h % 8000) + 1000) : pin
}

const WEAK_DEMO_PINS = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1212','2580'])

// Registers for a fresh installation. Shops carry coordinates so a household's
// position can be resolved against them without an external geocoding service.

const SHOPS = [
  {
    code: 'FPS 2107', name: 'Ward 4 fair price shop', dealer: 'M. Srinivasa Rao',
    licence: 'AP/GNT/2107', address: 'Ward 4, Mangalagiri',
    district: 'Guntur', mandal: 'Mangalagiri', lat: 16.4307, lng: 80.568,
    timings: '08:00 – 12:00, 16:00 – 19:00', weeklyClosing: 'Sunday', device: 'ePoS 2107-D',
    stock: { rice: 4120, wheat: 1180, sugar: 96 },
    opening: { rice: 9000, wheat: 4000, sugar: 900 },
    staff: [
      { name: 'K. Nagaraju', role: 'Helper', rights: 'Weighing only' },
      { name: 'B. Salma', role: 'Helper', rights: 'Weighing only' },
    ],
  },
  {
    code: 'FPS 2211', name: 'Bus stand road fair price shop', dealer: 'K. Ratnam',
    licence: 'AP/GNT/2211', address: 'Bus stand road, Tadepalli',
    district: 'Guntur', mandal: 'Tadepalli', lat: 16.48, lng: 80.6,
    timings: '08:00 – 12:00, 16:00 – 19:00', weeklyClosing: 'Sunday', device: 'ePoS 2211-A',
    stock: { rice: 2870, wheat: 940, sugar: 310 },
    opening: { rice: 7000, wheat: 3000, sugar: 800 },
    staff: [{ name: 'P. Anjali', role: 'Helper', rights: 'Weighing only' }],
  },
  {
    code: 'FPS 1904', name: 'Kothapeta fair price shop', dealer: 'G. Venkateswarlu',
    licence: 'AP/GNT/1904', address: 'Kothapeta, Guntur city',
    district: 'Guntur', mandal: 'Guntur East', lat: 16.3067, lng: 80.4365,
    timings: '08:00 – 12:00, 17:00 – 20:00', weeklyClosing: 'Sunday', device: 'ePoS 1904-B',
    stock: { rice: 5210, wheat: 1600, sugar: 480 },
    opening: { rice: 8500, wheat: 3500, sugar: 850 },
    staff: [{ name: 'M. Lavanya', role: 'Helper', rights: 'Weighing only' }],
  },
  {
    code: 'FPS 3312', name: 'Governorpet fair price shop', dealer: 'S. Prasad Rao',
    licence: 'AP/KRI/3312', address: 'Governorpet, Vijayawada',
    district: 'Krishna', mandal: 'Vijayawada Central', lat: 16.5062, lng: 80.648,
    timings: '08:00 – 12:00, 16:00 – 19:00', weeklyClosing: 'Sunday', device: 'ePoS 3312-C',
    stock: { rice: 3640, wheat: 1020, sugar: 260 },
    opening: { rice: 7500, wheat: 3200, sugar: 700 },
    staff: [{ name: 'T. Sridevi', role: 'Helper', rights: 'Weighing only' }],
  },
  {
    code: 'FPS 4820', name: 'Gajuwaka fair price shop', dealer: 'A. Lakshmi Narayana',
    licence: 'AP/VSP/4820', address: 'Gajuwaka, Visakhapatnam',
    district: 'Visakhapatnam', mandal: 'Gajuwaka', lat: 17.6868, lng: 83.2185,
    timings: '07:30 – 11:30, 16:00 – 19:00', weeklyClosing: 'Sunday', device: 'ePoS 4820-A',
    stock: { rice: 6100, wheat: 2100, sugar: 540 },
    opening: { rice: 10000, wheat: 4200, sugar: 950 },
    staff: [{ name: 'R. Bhavani', role: 'Helper', rights: 'Weighing only' }],
  },
]

const family = (...names) => names.map((n) => {
  const [name, role] = n.split('|')
  return { name, role }
})

const CARDS = [
  {
    number: '28AP-0417-9930', holder: 'Lakshmi Devi K.', scheme: 'PHH', members: 5,
    mobile: '98490 41234', address: '4-118, Ward 4, Mangalagiri', shop: 'FPS 2107',
    district: 'Guntur', mandal: 'Mangalagiri', assistance: { status: 'none' },
    family: family('Lakshmi Devi K.|Head of family', 'Ramesh K.|Spouse', 'Anitha K.|Daughter', 'Suresh K.|Son', 'Kiran K.|Son'),
  },
  {
    number: '28AP-0417-9931', holder: 'Padma Rani B.', scheme: 'AAY', members: 2,
    mobile: '99590 77012', address: '2-40, Ward 6, Mangalagiri', shop: 'FPS 2107',
    district: 'Guntur', mandal: 'Mangalagiri',
    // Verified last cycle by the district, valid for a year.
    assistance: {
      status: 'verified', ground: 'senior', member: 'Padma Rani B.',
      documentRef: 'AADHAAR ****4417', requestedAt: '2026-07-02T09:10:00.000Z',
      decidedAt: '2026-07-04T11:20:00.000Z', decidedBy: 'user-s006',
      expiresOn: '2027-07-04',
    },
    family: family('Padma Rani B.|Head of family, age 71', 'Sailaja B.|Daughter'),
  },
  {
    number: '28AP-0417-9944', holder: 'Yesu Babu D.', scheme: 'PHH', members: 3,
    mobile: '97001 55210', address: '7-22, Ward 2, Mangalagiri', shop: 'FPS 2107',
    district: 'Guntur', mandal: 'Mangalagiri', assistance: { status: 'none' },
    family: family('Yesu Babu D.|Head of family', 'Rani D.|Spouse', 'Joshua D.|Son'),
  },
  {
    number: '28AP-0512-4417', holder: 'Mohammad Iqbal', scheme: 'PHH', members: 4,
    mobile: '90001 22345', address: '11-3, Bus stand road, Tadepalli', shop: 'FPS 2211',
    district: 'Guntur', mandal: 'Tadepalli', assistance: { status: 'none' },
    family: family('Mohammad Iqbal|Head of family', 'Ayesha Begum|Spouse', 'Zoya Fatima|Daughter', 'Imran Khan|Son'),
  },
  {
    number: '28AP-0512-4430', holder: 'Sarojini B.', scheme: 'AAY', members: 1,
    mobile: '90112 33447', address: '3-9, Canal road, Tadepalli', shop: 'FPS 2211',
    district: 'Guntur', mandal: 'Tadepalli',
    // Applied, awaiting an officer's decision — the review queue is not empty.
    assistance: {
      status: 'pending', ground: 'sole', member: 'Sarojini B.',
      documentRef: 'Self-declaration, ward volunteer countersigned',
      requestedAt: '2026-08-16T07:40:00.000Z',
    },
    family: family('Sarojini B.|Head of family, age 78'),
  },
  {
    number: '28AP-0331-1180', holder: 'Venkata Rao G.', scheme: 'PHH', members: 6,
    mobile: '99880 12300', address: '5-14, Kothapeta, Guntur', shop: 'FPS 1904',
    district: 'Guntur', mandal: 'Guntur East', assistance: { status: 'none' },
    family: family('Venkata Rao G.|Head of family', 'Padmavathi G.|Spouse', 'Naveen G.|Son', 'Divya G.|Daughter', 'Harika G.|Daughter', 'Sarada G.|Mother'),
  },
  {
    number: '28AP-0331-1206', holder: 'Fatima Bi', scheme: 'PHH', members: 3,
    mobile: '99881 45522', address: '9-31, Kothapeta, Guntur', shop: 'FPS 1904',
    district: 'Guntur', mandal: 'Guntur East',
    assistance: {
      status: 'verified', ground: 'disability', member: 'Rehan S.',
      documentRef: 'UDID ****9930', requestedAt: '2026-06-11T10:00:00.000Z',
      decidedAt: '2026-06-13T16:05:00.000Z', decidedBy: 'user-s006',
      expiresOn: '2027-06-13',
    },
    family: family('Fatima Bi|Head of family', 'Rehan S.|Son', 'Nadia S.|Daughter'),
  },
  {
    number: '16AP-0904-7712', holder: 'Srinivas Reddy P.', scheme: 'PHH', members: 4,
    mobile: '90303 88771', address: '12-7, Governorpet, Vijayawada', shop: 'FPS 3312',
    district: 'Krishna', mandal: 'Vijayawada Central', assistance: { status: 'none' },
    family: family('Srinivas Reddy P.|Head of family', 'Vasantha P.|Spouse', 'Karthik P.|Son', 'Meghana P.|Daughter'),
  },
  {
    number: '16AP-0904-7730', holder: 'Rajeswari M.', scheme: 'AAY', members: 2,
    mobile: '90304 11298', address: '4-56, Governorpet, Vijayawada', shop: 'FPS 3312',
    district: 'Krishna', mandal: 'Vijayawada Central', assistance: { status: 'none' },
    family: family('Rajeswari M.|Head of family', 'Bhargav M.|Son'),
  },
  {
    number: '31AP-1120-5561', holder: 'Appalaraju N.', scheme: 'PHH', members: 5,
    mobile: '91771 20045', address: '2-88, Gajuwaka, Visakhapatnam', shop: 'FPS 4820',
    district: 'Visakhapatnam', mandal: 'Gajuwaka', assistance: { status: 'none' },
    family: family('Appalaraju N.|Head of family', 'Satyavathi N.|Spouse', 'Ganesh N.|Son', 'Swathi N.|Daughter', 'Lokesh N.|Son'),
  },
  {
    number: '31AP-1120-5588', holder: 'Kanaka Durga T.', scheme: 'PHH', members: 2,
    mobile: '91772 66310', address: '8-4, Gajuwaka, Visakhapatnam', shop: 'FPS 4820',
    district: 'Visakhapatnam', mandal: 'Gajuwaka',
    // Verified a year ago and now lapsed — needs renewing before delivery works.
    assistance: {
      status: 'verified', ground: 'senior', member: 'Kanaka Durga T.',
      documentRef: 'AADHAAR ****5588', requestedAt: '2025-07-01T09:00:00.000Z',
      decidedAt: '2025-07-03T09:00:00.000Z', decidedBy: 'user-s008',
      expiresOn: '2026-07-03',
    },
    family: family('Kanaka Durga T.|Head of family, age 68', 'Ravi T.|Son'),
  },
]

// Households sign in with a card PIN set at the shop counter.
const STAFF = [
  { identifier: 'AP/GNT/2107', password: '4821', role: 'dealer', shopCode: 'FPS 2107', name: 'M. Srinivasa Rao' },
  { identifier: 'AP/GNT/2211', password: '9134', role: 'dealer', shopCode: 'FPS 2211', name: 'K. Ratnam' },
  { identifier: 'AP/GNT/1904', password: '7702', role: 'dealer', shopCode: 'FPS 1904', name: 'G. Venkateswarlu' },
  { identifier: 'AP/KRI/3312', password: '5540', role: 'dealer', shopCode: 'FPS 3312', name: 'S. Prasad Rao' },
  { identifier: 'AP/VSP/4820', password: '6127', role: 'dealer', shopCode: 'FPS 4820', name: 'A. Lakshmi Narayana' },
  { identifier: 'HD-AP-1967', password: 'helpline@2026', role: 'helpline', name: 'Helpline desk 1 (1967)' },
  { identifier: 'HD-AP-1968', password: 'helpline@2026', role: 'helpline', name: 'Helpline desk 2 (1967)' },
  { identifier: 'JC-GNT-014', password: 'guntur@2026', role: 'officer', district: 'Guntur', name: 'Joint Collector, Guntur' },
  { identifier: 'JC-KRI-006', password: 'krishna@2026', role: 'officer', district: 'Krishna', name: 'Joint Collector, Krishna' },
  { identifier: 'JC-VSP-021', password: 'vizag@2026', role: 'officer', district: 'Visakhapatnam', name: 'Joint Collector, Visakhapatnam' },
]

// The five shops above are the demo district, with dealer logins and seeded
// queues. These are the rest of the country: real fair price shops exist in
// every state, and a household should find one near wherever they are rather
// than only in Andhra Pradesh. They carry no dealer account, so they appear in
// the household's shop list and in distance sorting without adding twenty more
// sets of credentials to remember at sign-in.
const NATIONAL = [
  ['FPS 1101', 'Model Town fair price shop', 'Ludhiana', 'Punjab', 'Ludhiana West', 30.9010, 75.8573, 'Gurpreet Singh Sandhu'],
  ['FPS 1112', 'Sector 22 fair price shop', 'Chandigarh', 'Chandigarh', 'Sector 22', 30.7333, 76.7794, 'Rakesh Verma'],
  ['FPS 1124', 'Civil Lines fair price shop', 'Amritsar', 'Punjab', 'Amritsar North', 31.6340, 74.8723, 'Jasbir Singh Gill'],
  ['FPS 1207', 'Karol Bagh fair price shop', 'New Delhi', 'Delhi', 'Karol Bagh', 28.6519, 77.1909, 'Rajinder Prasad'],
  ['FPS 1218', 'Rohini Sector 7 ration depot', 'North West Delhi', 'Delhi', 'Rohini', 28.7041, 77.1025, 'Vikas Chaudhary'],
  ['FPS 1305', 'Hazratganj fair price shop', 'Lucknow', 'Uttar Pradesh', 'Lucknow Central', 26.8467, 80.9462, 'Ashok Kumar Srivastava'],
  ['FPS 1319', 'Sigra fair price shop', 'Varanasi', 'Uttar Pradesh', 'Varanasi Sadar', 25.3176, 82.9739, 'Ram Naresh Tiwari'],
  ['FPS 1402', 'Malviya Nagar ration depot', 'Jaipur', 'Rajasthan', 'Jaipur South', 26.9124, 75.7873, 'Mahesh Chand Saini'],
  ['FPS 1418', 'Sardarpura fair price shop', 'Jodhpur', 'Rajasthan', 'Jodhpur City', 26.2389, 73.0243, 'Devi Lal Rathore'],
  ['FPS 1503', 'Navrangpura fair price shop', 'Ahmedabad', 'Gujarat', 'Ahmedabad West', 23.0225, 72.5714, 'Bhavesh Patel'],
  ['FPS 1516', 'Adajan fair price shop', 'Surat', 'Gujarat', 'Surat West', 21.1702, 72.8311, 'Nileshbhai Desai'],
  ['FPS 1604', 'Dadar West ration shop', 'Mumbai', 'Maharashtra', 'Dadar', 19.0176, 72.8562, 'Prakash More'],
  ['FPS 1621', 'Shivajinagar fair price shop', 'Pune', 'Maharashtra', 'Pune City', 18.5204, 73.8567, 'Sanjay Deshmukh'],
  ['FPS 1633', 'Sitabuldi fair price shop', 'Nagpur', 'Maharashtra', 'Nagpur Central', 21.1458, 79.0882, 'Vilas Wankhede'],
  ['FPS 1702', 'Jayanagar 4th Block depot', 'Bengaluru', 'Karnataka', 'Bengaluru South', 12.9279, 77.5937, 'Ramesh Gowda'],
  ['FPS 1715', 'Vidyagiri fair price shop', 'Hubballi', 'Karnataka', 'Hubballi Dharwad', 15.3647, 75.1240, 'Shivanand Patil'],
  ['FPS 1801', 'T. Nagar fair price shop', 'Chennai', 'Tamil Nadu', 'Chennai Central', 13.0418, 80.2341, 'K. Ramasamy'],
  ['FPS 1814', 'Gandhipuram ration shop', 'Coimbatore', 'Tamil Nadu', 'Coimbatore North', 11.0168, 76.9558, 'M. Palanisamy'],
  ['FPS 1902', 'Fort Kochi fair price shop', 'Ernakulam', 'Kerala', 'Kochi', 9.9312, 76.2673, 'Thomas Varghese'],
  ['FPS 1916', 'Pattom ration depot', 'Thiruvananthapuram', 'Kerala', 'Thiruvananthapuram', 8.5241, 76.9366, 'Rajan Pillai'],
  ['FPS 2002', 'Salt Lake Sector 2 shop', 'Kolkata', 'West Bengal', 'Bidhannagar', 22.5726, 88.3639, 'Biswajit Ghosh'],
  ['FPS 2015', 'Rash Behari ration shop', 'Kolkata', 'West Bengal', 'Ballygunge', 22.5150, 88.3639, 'Tapan Chatterjee'],
  ['FPS 2104', 'Kankarbagh fair price shop', 'Patna', 'Bihar', 'Patna East', 25.5941, 85.1376, 'Ravi Ranjan Singh'],
  ['FPS 2203', 'Saheed Nagar ration shop', 'Khordha', 'Odisha', 'Bhubaneswar', 20.2961, 85.8245, 'Prasanta Mohanty'],
  ['FPS 2301', 'Panbazar fair price shop', 'Kamrup Metro', 'Assam', 'Guwahati', 26.1445, 91.7362, 'Dhruba Baruah'],
  ['FPS 2402', 'Arera Colony ration shop', 'Bhopal', 'Madhya Pradesh', 'Bhopal Central', 23.2599, 77.4126, 'Santosh Malviya'],
  ['FPS 2501', 'Banjara Hills fair price shop', 'Hyderabad', 'Telangana', 'Khairatabad', 17.4126, 78.4071, 'Venkatesh Goud'],
  ['FPS 2601', 'Sector 17 ration depot', 'Gurugram', 'Haryana', 'Gurugram', 28.4595, 77.0266, 'Sandeep Kadyan'],
  ['FPS 2701', 'Rajpur Road fair price shop', 'Dehradun', 'Uttarakhand', 'Dehradun', 30.3165, 78.0322, 'Mohan Singh Bisht'],
  ['FPS 2801', 'Bemina fair price shop', 'Srinagar', 'Jammu and Kashmir', 'Srinagar', 34.0837, 74.7973, 'Bashir Ahmad Dar'],
]

// Stock is derived from the shop code rather than written out, so the figures
// vary between shops without thirty hand-maintained numbers. Roughly a third
// are left below their reorder level so low-stock alerts have something to show.
const STATE_CODE = {
  Punjab: 'PB', Chandigarh: 'CH', Delhi: 'DL', 'Uttar Pradesh': 'UP', Rajasthan: 'RJ',
  Gujarat: 'GJ', Maharashtra: 'MH', Karnataka: 'KA', 'Tamil Nadu': 'TN', Kerala: 'KL',
  'West Bengal': 'WB', Bihar: 'BR', Odisha: 'OD', Assam: 'AS', 'Madhya Pradesh': 'MP',
  Telangana: 'TG', Haryana: 'HR', Uttarakhand: 'UK', 'Jammu and Kashmir': 'JK',
}

// A licence reads STATE/DISTRICT/NUMBER, the same shape as the Andhra shops
// above, and is also the dealer's sign-in identifier.
export const licenceFor = (state, district, code) =>
  `${STATE_CODE[state] ?? 'IN'}/${district.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}/${code.replace(/\D/g, '')}`

// A stable four-digit PIN per shop, so credentials are the same on every
// machine that seeds without keeping thirty passwords in this file.
export const pinFor = (code) => String(((Number(code.replace(/\D/g, '')) * 7919) % 9000) + 1000)

function nationalShops() {
  return NATIONAL.map(([code, name, district, state, mandal, lat, lng, dealer], i) => {
    const n = Number(code.replace(/\D/g, ''))
    const opening = {
      rice: 6000 + (n % 7) * 500,
      wheat: 2500 + (n % 5) * 300,
      sugar: 600 + (n % 4) * 100,
    }
    const short = i % 3 === 0
    return {
      code,
      name,
      dealer,
      licence: licenceFor(state, district, code),
      address: `${mandal}, ${district}`,
      district,
      state,
      mandal,
      lat,
      lng,
      timings: i % 2 ? '08:00 – 12:00, 16:00 – 19:00' : '07:00 – 11:00, 17:00 – 20:00',
      weeklyClosing: ['Sunday', 'Monday', 'Tuesday'][i % 3],
      device: `ePoS ${code.replace('FPS ', '')}-N`,
      stock: {
        rice: Math.round(opening.rice * (short ? 0.06 : 0.42)),
        wheat: Math.round(opening.wheat * (short ? 0.05 : 0.38)),
        sugar: short ? 80 : Math.round(opening.sugar * 0.45),
      },
      opening,
      staff: [],
    }
  })
}

// The eleven cards above are the demo district, used by the walkthrough and by
// the tests. These are households at the national shops, so a judge signing in
// from anywhere sees a card that belongs where they are. Each line is:
//   card number | holder | shop | scheme | mobile | address | family
const NATIONAL_CARDS = [
  ['03PB-0221-1140', 'Harpreet Kaur', 'FPS 1101', 'PHH', '98140 22110', 'H. No. 412, Model Town',
   'Harpreet Kaur|Head of family;Gurdeep Singh|Spouse;Simran Kaur|Daughter;Jaskaran Singh|Son'],
  ['03PB-0221-1155', 'Balwinder Singh', 'FPS 1101', 'AAY', '98156 40321', 'H. No. 77, Gill Road',
   'Balwinder Singh|Head of family, age 74;Rajwant Kaur|Spouse'],
  ['04CH-0310-2201', 'Anil Sharma', 'FPS 1112', 'PHH', '94170 55120', 'H. No. 1204, Sector 22-B',
   'Anil Sharma|Head of family;Sunita Sharma|Spouse;Nikhil Sharma|Son'],
  ['03PB-0417-3302', 'Manjit Kaur', 'FPS 1124', 'PHH', '98722 41190', 'St. No. 6, Civil Lines',
   'Manjit Kaur|Head of family;Sukhwinder Singh|Spouse;Navjot Kaur|Daughter;Ekam Singh|Son;Prabh Kaur|Daughter'],
  ['07DL-0512-4410', 'Sunita Devi', 'FPS 1207', 'PHH', '98110 33421', 'Gali No. 9, Karol Bagh',
   'Sunita Devi|Head of family;Ram Kishan|Spouse;Pooja|Daughter;Aakash|Son'],
  ['07DL-0512-4428', 'Mohammed Arif', 'FPS 1218', 'PHH', '99530 71200', 'Pocket 4, Rohini Sector 7',
   'Mohammed Arif|Head of family;Nasreen Bano|Spouse;Sameer Arif|Son'],
  ['09UP-0620-5511', 'Ram Prasad Yadav', 'FPS 1305', 'AAY', '94150 62230', '221-C, Hazratganj',
   'Ram Prasad Yadav|Head of family, age 69;Shanti Devi|Spouse'],
  ['09UP-0620-5534', 'Kamla Devi', 'FPS 1319', 'PHH', '90440 11876', '18/7, Sigra',
   'Kamla Devi|Head of family;Shiv Kumar|Son;Rekha Devi|Daughter-in-law;Aarti|Granddaughter'],
  ['08RJ-0733-6602', 'Meena Gurjar', 'FPS 1402', 'PHH', '94140 88012', 'B-71, Malviya Nagar',
   'Meena Gurjar|Head of family;Bhanwar Lal|Spouse;Pinky|Daughter'],
  ['08RJ-0733-6619', 'Ismail Khan', 'FPS 1418', 'PHH', '99280 40551', '54, Sardarpura',
   'Ismail Khan|Head of family;Shabana Khan|Spouse;Rehan Khan|Son;Alina Khan|Daughter'],
  ['24GJ-0841-7703', 'Kiran Patel', 'FPS 1503', 'PHH', '98250 61140', 'B-12, Navrangpura',
   'Kiran Patel|Head of family;Jayesh Patel|Spouse;Dhruv Patel|Son'],
  ['24GJ-0841-7721', 'Rekha Solanki', 'FPS 1516', 'AAY', '99790 30012', '9, Adajan Gam',
   'Rekha Solanki|Head of family, age 66;Vipul Solanki|Son'],
  ['27MH-0950-8801', 'Sunil Kamble', 'FPS 1604', 'PHH', '98200 45510', 'Chawl No. 3, Dadar West',
   'Sunil Kamble|Head of family;Vaishali Kamble|Spouse;Rohit Kamble|Son;Sneha Kamble|Daughter'],
  ['27MH-0950-8830', 'Shobha Jadhav', 'FPS 1621', 'PHH', '94220 70118', 'Lane 4, Shivajinagar',
   'Shobha Jadhav|Head of family;Ganesh Jadhav|Spouse;Pooja Jadhav|Daughter'],
  ['27MH-0950-8844', 'Imtiaz Sheikh', 'FPS 1633', 'PHH', '90280 21140', '12, Sitabuldi',
   'Imtiaz Sheikh|Head of family;Fauzia Sheikh|Spouse;Adnan Sheikh|Son'],
  ['29KA-1060-9902', 'Lakshmamma R.', 'FPS 1702', 'AAY', '98450 33120', '44, Jayanagar 4th Block',
   'Lakshmamma R.|Head of family, age 72;Manjunath R.|Son'],
  ['29KA-1060-9931', 'Basavaraj H.', 'FPS 1715', 'PHH', '94480 55201', '7-3, Vidyagiri',
   'Basavaraj H.|Head of family;Shanta H.|Spouse;Kavya H.|Daughter;Vinay H.|Son'],
  ['33TN-1170-1102', 'Selvi Murugan', 'FPS 1801', 'PHH', '98400 71230', '18, Thyagaraya Nagar',
   'Selvi Murugan|Head of family;Murugan S.|Spouse;Divya M.|Daughter;Karthik M.|Son'],
  ['33TN-1170-1128', 'Abdul Rahman', 'FPS 1814', 'PHH', '94870 22450', '6/2, Gandhipuram',
   'Abdul Rahman|Head of family;Salma Beevi|Spouse;Farhan A.|Son'],
  ['32KL-1280-2203', 'Mariamma Joseph', 'FPS 1902', 'PHH', '94470 60310', 'Door 21, Fort Kochi',
   'Mariamma Joseph|Head of family;Joseph K.|Spouse;Anu Joseph|Daughter'],
  ['32KL-1280-2240', 'Suresh Nair', 'FPS 1916', 'PHH', '98950 41120', 'TC 4/118, Pattom',
   'Suresh Nair|Head of family;Beena Nair|Spouse;Arjun Nair|Son;Meera Nair|Daughter'],
  ['19WB-1390-3301', 'Aparna Das', 'FPS 2002', 'PHH', '98300 22140', 'CE-92, Salt Lake Sector 2',
   'Aparna Das|Head of family;Subrata Das|Spouse;Rimi Das|Daughter'],
  ['19WB-1390-3345', 'Sheikh Jamal', 'FPS 2015', 'AAY', '90510 33201', '77/4, Rash Behari Avenue',
   'Sheikh Jamal|Head of family, age 68;Rahima Bibi|Spouse'],
  ['10BR-1420-4402', 'Sunita Kumari', 'FPS 2104', 'PHH', '94310 51120', 'Road 8, Kankarbagh',
   'Sunita Kumari|Head of family;Rajesh Paswan|Spouse;Chandan Kumar|Son;Khushi Kumari|Daughter;Aman Kumar|Son'],
  ['21OD-1530-5503', 'Jyotsna Sahoo', 'FPS 2203', 'PHH', '94370 60240', 'Plot 118, Saheed Nagar',
   'Jyotsna Sahoo|Head of family;Bijay Sahoo|Spouse;Sibani Sahoo|Daughter'],
  ['18AS-1640-6601', 'Nayan Talukdar', 'FPS 2301', 'PHH', '94350 71130', 'H. No. 9, Panbazar',
   'Nayan Talukdar|Head of family;Bharati Talukdar|Spouse;Pori Talukdar|Daughter'],
  ['23MP-1750-7702', 'Ramesh Ahirwar', 'FPS 2402', 'PHH', '94250 40190', 'E-4, Arera Colony',
   'Ramesh Ahirwar|Head of family;Sarita Ahirwar|Spouse;Deepak Ahirwar|Son'],
  ['36TG-1860-8801', 'Fatima Begum', 'FPS 2501', 'AAY', '90000 51240', '8-2-120, Banjara Hills',
   'Fatima Begum|Head of family, age 70;Rizwana Begum|Daughter'],
  ['06HR-1970-9902', 'Poonam Yadav', 'FPS 2601', 'PHH', '98120 60340', 'H. No. 55, Sector 17',
   'Poonam Yadav|Head of family;Naresh Yadav|Spouse;Tanu Yadav|Daughter;Kunal Yadav|Son'],
  ['05UK-2080-1103', 'Deepa Rawat', 'FPS 2701', 'PHH', '94120 33210', '22, Rajpur Road',
   'Deepa Rawat|Head of family;Mahesh Rawat|Spouse;Ananya Rawat|Daughter'],
  ['01JK-2190-2204', 'Ghulam Nabi', 'FPS 2801', 'PHH', '94190 55120', 'Lane 3, Bemina',
   'Ghulam Nabi|Head of family;Hafiza Bano|Spouse;Bilal Ahmad|Son;Ruqaya Bano|Daughter'],
]

function nationalCards(shops) {
  return NATIONAL_CARDS.map(([number, holder, shop, scheme, mobile, address, kin]) => {
    const at = shops.find((s) => s.code === shop)
    const members = kin.split(';').length
    return {
      number,
      holder,
      scheme,
      // AAY is a flat household entitlement, so member count does not drive it.
      members,
      mobile,
      address,
      shop,
      district: at?.district ?? '',
      mandal: at?.mandal ?? '',
      assistance: { status: 'none' },
      family: family(...kin.split(';')),
    }
  })
}

export const SEED_ACCOUNTS = [
  ...CARDS.map((c) => ({ identifier: c.number, role: 'beneficiary', name: c.holder, note: 'card PIN' })),
  ...STAFF.map((s) => ({ identifier: s.identifier, role: s.role, name: s.name, note: s.password })),
]

// A shop does not open its day at token one. By the time anyone demonstrates
// the app, the counter has already issued tokens to walk-ins, so each shop
// carries a starting number and a few of today's bookings against it. Without
// this the register is empty and the first booking is always T-001.
const DAY_SO_FAR = {
  'FPS 2107': { from: 11, queue: ['28AP-0417-9944'] },
  'FPS 2211': { from: 7, queue: ['28AP-0512-4417'] },
  'FPS 1904': { from: 14, queue: ['28AP-0331-1206'] },
  'FPS 3312': { from: 5, queue: ['16AP-0904-7712', '16AP-0904-7730'] },
  'FPS 4820': { from: 9, queue: ['31AP-1120-5561', '31AP-1120-5588'] },
}

const SEED_SLOTS = ['09:00 – 09:30', '10:00 – 10:30', '11:00 – 11:30']

function buildBookings(date) {
  const rows = []
  for (const [shop, { from, queue }] of Object.entries(DAY_SO_FAR)) {
    queue.forEach((cardNumber, i) => {
      const n = from + i
      rows.push({
        id: `bk-seed-${shop.replace(/\W/g, '').toLowerCase()}-${n}`,
        token: `T-${String(n).padStart(3, '0')}`,
        secret: randomBytes(6).toString('base64url'),
        cardNumber,
        shop,
        slot: SEED_SLOTS[i % SEED_SLOTS.length],
        date,
        status: 'booked',
        channel: i === 0 ? 'counter' : 'app',
        bookedBy: null,
        createdAt: new Date().toISOString(),
      })
    })
  }
  return rows
}

export function buildSeed() {
  const state = emptyState()
  state.shops = [...SHOPS, ...nationalShops()]
  // Every ration card carries an RFID tag, so the shop can identify a household
  // by tapping the card instead of keying the number.
  state.cards = [...CARDS, ...nationalCards(state.shops)].map((c) => ({
    ...c,
    rfidTag: tagFor(c.number),
  }))
  state.bookings = buildBookings(today())

  const beneficiaries = state.cards.map((c, i) => ({
    id: `user-b${String(i + 1).padStart(3, '0')}`,
    identifier: c.number,
    // Set at the shop counter in the real flow; pre-set here so the demo has
    // households that can sign in immediately.
    passwordHash: hashPassword(cardPin(c.number)),
    pinSetAt: new Date().toISOString(),
    role: 'beneficiary',
    name: c.holder,
    cardNumber: c.number,
    shopCode: null,
    district: c.district,
    createdAt: new Date().toISOString(),
  }))

  // Every shop needs a dealer who can sign in, and every district needs an
  // officer, or the dealer and district portals only work in Andhra Pradesh.
  // These are derived from the shops actually in the state rather than listed
  // by hand, so adding a shop adds its credentials automatically.
  const generated = []
  for (const shop of state.shops) {
    if (STAFF.some((a) => a.shopCode === shop.code)) continue
    generated.push({
      identifier: shop.licence,
      password: pinFor(shop.code),
      role: 'dealer',
      shopCode: shop.code,
      name: shop.dealer,
    })
  }

  const districts = [...new Set(state.shops.map((s) => s.district))]
  for (const district of districts) {
    if (STAFF.some((a) => a.district === district)) continue
    const abbr = district.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    generated.push({
      identifier: `JC-${abbr}-${String(districts.indexOf(district) + 1).padStart(3, '0')}`,
      password: `${district.toLowerCase().replace(/[^a-z]/g, '')}@2026`,
      role: 'officer',
      district,
      name: `Joint Collector, ${district}`,
    })
  }

  const staff = [...STAFF, ...generated].map((s, i) => ({
    id: `user-s${String(i + 1).padStart(3, '0')}`,
    identifier: s.identifier,
    passwordHash: hashPassword(s.password),
    role: s.role,
    name: s.name,
    cardNumber: null,
    shopCode: s.shopCode ?? null,
    district: s.district ?? null,
    createdAt: new Date().toISOString(),
  }))

  state.users = [...beneficiaries, ...staff]
  return state
}

// Used by the seed to write the credential list. Hand-listed staff keep their
// chosen password; generated dealers use the PIN derived from their shop code,
// and generated officers use their district name.
export function credentialFor(user) {
  const listed = SEED_ACCOUNTS.find((a) => a.identifier === user.identifier)
  if (listed && listed.note !== 'card PIN') return listed.note
  if (user.role === 'dealer' && user.shopCode) return pinFor(user.shopCode)
  if (user.role === 'officer' && user.district) return `${user.district.toLowerCase().replace(/[^a-z]/g, '')}@2026`
  if (user.role === 'beneficiary') return cardPin(user.identifier)
  return '—'
}
