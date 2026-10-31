// ─── One-time fix: correct wrong ISO 7010 code mappings ──────────────────────
// Removes codes that map to wrong hazards in BS EN ISO 7010:2020 and
// corrects W042 description (arc flash, not vibration).
//
// Run once: pnpm --filter @complianceforge/api exec tsx --env-file=.env src/scripts/fixAssetCodes.ts

import { sql } from '../db/client.js';

async function fix() {
  // Delete codes that point to wrong hazards on Wikimedia Commons / ISO 7010:2020:
  //   W033 → barbed wire (not arc flash; arc flash is W042)
  //   W040 → roof snow avalanche (not hot surface; use W013 for temperature)
  //   W041 → breathing hazard / asphyxiation (duplicate of W011; not wet floor)
  //   W044 → boat slipway (not noise; noise is W087)
  //   M035 → "exit towpath after falling into water" (not fall arrest; use M018)
  const deleted = await sql`
    DELETE FROM proxy_assets
    WHERE standard = 'iso7010'
      AND symbol_code = ANY(ARRAY['W033', 'W040', 'W041', 'W044', 'M035'])
    RETURNING symbol_code
  `;
  console.log(`Deleted ${deleted.length} wrong-code rows:`, deleted.map((r) => (r as { symbol_code: string }).symbol_code).join(', '));

  // Also delete W042 so seed can re-insert it with the corrected arc flash description.
  const w042 = await sql`
    DELETE FROM proxy_assets
    WHERE standard = 'iso7010' AND symbol_code = 'W042'
    RETURNING symbol_code
  `;
  if (w042.length > 0) {
    console.log('Deleted W042 (to be re-seeded with correct arc flash description)');
  }

  console.log('Done. Re-run db:seed-assets to insert corrected W042, new M018 and W087.');
  process.exit(0);
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
