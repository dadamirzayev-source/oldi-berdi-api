export default function BootstrapPage() {
  const enabled = process.env.BOOTSTRAP_UI?.trim() === "1";
  if (!enabled) {
    return (
      <main style={{ fontFamily: "system-ui", margin: 24 }}>
        <h1>Bootstrap</h1>
        <p>Disabled.</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "system-ui", margin: 24, maxWidth: 480 }}>
      <h1>Oldi-berdi bootstrap</h1>
      <p>
        One-shot: resets pair <code>MNEQ9TZK</code> provisional PINs. Disable{" "}
        <code>BOOTSTRAP_UI</code> after use.
      </p>
      <button type="button" id="go" style={{ padding: "8px 16px", fontSize: 16 }}>
        Create / reset PINs
      </button>
      <pre id="result" style={{ marginTop: 16, whiteSpace: "pre-wrap" }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
document.getElementById('go').onclick = async function () {
  var r = document.getElementById('result');
  r.textContent = 'Working…';
  try {
    var res = await fetch('/api/bootstrap', { method: 'POST' });
    var data = await res.json();
    if (!data.ok) {
      r.textContent = (data.error || 'failed') + ' (' + res.status + ')';
      return;
    }
    r.textContent =
      'Pair: ' + data.pair_code + '\\n' +
      'PIN A (Olimjon): ' + data.provisional_pins.A + '\\n' +
      'PIN B (Azizbek): ' + data.provisional_pins.B + '\\n' +
      'must_change: true — change PIN in app before sync.\\n' +
      'Copy these now; they will not be shown again.';
  } catch (e) {
    r.textContent = String(e);
  }
};
`,
        }}
      />
    </main>
  );
}
