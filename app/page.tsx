export default function Home() {
  return (
    <main>
      <h1>Oldi-berdi API</h1>
      <p>HTTPS sync server for the Oldi-berdi Android app.</p>
      <ul>
        <li>GET /api/health</li>
        <li>POST /api/pair</li>
        <li>POST /api/entries</li>
        <li>POST /api/entries/:id/confirm|reject</li>
        <li>GET /api/sync</li>
      </ul>
    </main>
  );
}
