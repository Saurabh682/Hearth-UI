const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const axios = require('axios');
const app = express();
const PORT = 8081;

app.use(cors());
app.use(express.json());

app.get('/models', (req, res) => {
  exec('ollama list', (err, stdout) => {
    if (err) return res.status(500).send('Ollama not found');
    const models = stdout.split('\n').slice(1).map(line => line.split(/\s+/)[0]);
    res.json({ models });
  });
});

app.post('/chat', async (req, res) => {
  const { model, prompt } = req.body;
  const stream = await axios.post('http://localhost:11434/api/generate', {
    model, prompt
  }, { responseType: 'stream' });

  let full = '';
  stream.data.on('data', buf => {
    const str = buf.toString().trim();
    try {
      const json = JSON.parse(str);
      full += json.response || '';
    } catch {}
  });

  stream.data.on('end', () => {
    res.json({ response: full || '[no response]' });
  });
});

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
