export default function Home() {
  return (
    <main>
      <h1>Oldi-berdi API</h1>
      <p>HTTPS sync — pair code + per-role PIN (Bearer session).</p>
      <ul>
        <li>GET /api/health</li>
        <li>POST /api/pair</li>
        <li>GET /api/auth/status · POST /api/auth/set-pin · login · change-pin</li>
        <li>POST /api/entries (Bearer)</li>
        <li>POST /api/entries/:id/confirm|reject (Bearer)</li>
        <li>GET /api/sync (Bearer)</li>
      </ul>
    </main>
  );
}
