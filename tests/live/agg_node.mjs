// Dieselbe Rechnung wie tools/build_prices.mjs, aber auf einer gespeicherten Auktionsliste
import {readFileSync, writeFileSync} from 'node:fs';
import {aggregate} from '../../tools/lib/ah.mjs';
const a = JSON.parse(readFileSync(process.argv[2], 'utf8'));
writeFileSync(process.argv[3], JSON.stringify(aggregate(a.auctions)));
