Backend API definition

Five endpoints, one fixed seller enforced server-side (never trust the client to pass a seller address — this is where the "one seller only" rule from section 3.5 actually gets enforced in code, not just in the UI).

Method	Path	Purpose
GET	/api/health	Relayer balance, gas price, uptime, WS client count — check this before anything else
POST	/api/escrow/create	Atomic create+fund, to the server-configured demo seller only
POST	/api/escrow/confirm	Buyer releases funds; server verifies buyerAddress matches the stored buyer
GET	/api/escrow/:id	Single escrow lookup
GET	/api/escrow/list?limit=	Recent escrows, newest first — also the dashboard's WebSocket-fallback polling target

Now the Bruno collection — including two negative tests that matter more than the happy paths: wrong-buyer confirm (checks nobody can drain someone else's escrow) and double-confirm (checks funds can't release twice).

Created 10 files, read 2 files

How to use this: download the whole folder, open it in Bruno as a collection, select the "Local" environment, and hit "Run Collection" to fire all 8 requests in order against your relayer once it's up — even before the frontend exists. Update demoSellerAddress and testBuyerAddress in the Local environment once you have real addresses.

The two tests I'd treat as gating, not optional: 05-confirm-wrong-buyer and 06-confirm-already-released. If either of those fails against your real backend, don't move on to the frontend yet — that's a funds-security bug in the relayer's auth model, not a polish item.