/**
 * Firestore 컬렉션 데이터 덤프 스크립트
 *
 * 사용법:
 *   node scripts/firestore-dump.js                     # 모든 컬렉션 요약
 *   node scripts/firestore-dump.js notifications       # 특정 컬렉션 상세
 *   node scripts/firestore-dump.js events --json       # JSON으로 출력
 *   node scripts/firestore-dump.js --json > dump.json  # 파일로 저장
 *
 * 주의:
 *   Firestore Security Rules가 read 권한을 막아두면 permission-denied 발생.
 *   그 경우 콘솔에서 임시로 룰 완화하거나 firebase-admin + 서비스 계정 사용.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, terminate } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBf0KhGFpJhjlR3dBUoNXJbK91Tf9lXCdA',
  authDomain: 'teamap-103a7.firebaseapp.com',
  projectId: 'teamap-103a7',
  storageBucket: 'teamap-103a7.firebasestorage.app',
  messagingSenderId: '29094405088',
  appId: '1:29094405088:web:fd0548490bc101c2a80185',
};

const COLLECTIONS = ['notifications', 'events', 'member_status'];

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const targets = args.filter((a) => !a.startsWith('--'));
const wanted = targets.length > 0 ? targets : COLLECTIONS;

function safe(v) {
  if (v === null || v === undefined) return v;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(safe);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = safe(val);
    return out;
  }
  return v;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const result = {};
  for (const name of wanted) {
    try {
      const snap = await getDocs(collection(db, name));
      const docs = [];
      snap.forEach((doc) => {
        docs.push({ id: doc.id, ...safe(doc.data()) });
      });
      result[name] = docs;
    } catch (e) {
      result[name] = { error: e.message };
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 사람 친화 출력
  for (const [name, val] of Object.entries(result)) {
    console.log(`\n━━━ ${name} ━━━`);
    if (val.error) {
      console.log(`  ✗ ${val.error}`);
      continue;
    }
    if (val.length === 0) {
      console.log('  (비어있음)');
      continue;
    }
    console.log(`  ${val.length}개 문서`);
    for (const doc of val) {
      const preview = JSON.stringify(doc).slice(0, 200);
      console.log(`  ◦ ${preview}${preview.length >= 200 ? '...' : ''}`);
    }
  }
  console.log('');
  await terminate(db);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('실패:', e.message);
    process.exit(1);
  });
