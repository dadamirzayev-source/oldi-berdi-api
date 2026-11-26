export default function Home() {
  return (
    <main>
      <h1>Oldi-berdi API</h1>
      <p>HTTPS sync — pair code + PIN (role from PIN; Bearer session).</p>
      <ul>
        <li>GET /api/health</li>
        <li>POST /api/pair</li>
        <li>GET /api/auth/status?pair_code=</li>
        <li>POST /api/auth/set-pin {"{"} pair_code, role, pin {"}"}</li>
        <li>POST /api/auth/login {"{"} pair_code, pin {"}"}</li>
        <li>POST /api/auth/change-pin (Bearer)</li>
        <li>POST /api/entries · confirm|reject · GET /api/sync (Bearer)</li>
      </ul>
    </main>
  );
}
