export default function BootstrapPage() {
  return (
    <main style={{ fontFamily: "system-ui", margin: 24, maxWidth: 480 }}>
      <h1>Oldi-berdi bootstrap</h1>
      <p>
        Operator only. Paste your <code>PAIR_CREATE_KEY</code> from Cursor Secrets
        (not chat), then reset provisional PINs for the baked pair.
      </p>
      <label style={{ display: "block", marginBottom: 8 }}>
        Create key
        <input
          id="key"
          type="password"
          autoComplete="off"
          style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
        />
      </label>
      <button type="button" id="go" style={{ padding: "8px 16px", fontSize: 16 }}>
        Reset PINs
      </button>
      <pre id="result" style={{ marginTop: 16, whiteSpace: "pre-wrap" }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
document.getElementById('go').onclick = async function () {
  var r = document.getElementById('result');
  var key = document.getElementById('key').value.trim();
  r.textContent = 'Working…';
  if (!key) {
    r.textContent = 'Create key required';
    return;
  }
  try {
    var res = await fetch('/api/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pair-create-key': key,
      },
      body: '{}',
    });
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
      'Copy these now; share PINs with the agent (never the create key).';
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
