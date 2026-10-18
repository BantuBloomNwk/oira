// The read token only opens the count for the address it was made for.
//   node e2e/notify-unit.mjs
process.env.OIRA_NOTIFY_SECRET = 'test-secret';
const { notifyToken, ownerOfToken } = await import('../notify.mjs');
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const a = '9CRbGP7xrN6D7VcW3FzFwtZ5boRpc9BWtzbcJCHxbhkC', b = '6wWrPkhSDFLqGFXY5Q2TxpEWSDQ4YT1aDnE4hA7XQZs7';
const ta = notifyToken(a);
check('a token is issued', typeof ta === 'string' && ta.startsWith(a + '.'));
check('it opens her own count', ownerOfToken(ta) === a);
check('swapping the address breaks it', ownerOfToken(ta.replace(a, b)) === null);
check('a changed mac is refused', ownerOfToken(ta.slice(0, -2) + (ta.endsWith('AA') ? 'BB' : 'AA')) === null);
check('garbage is refused', ownerOfToken('nonsense') === null && ownerOfToken('') === null && ownerOfToken(null) === null);
process.env.OIRA_NOTIFY_SECRET = 'other-secret';
check('a different bridge secret refuses it', ownerOfToken(ta) === null);
console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
