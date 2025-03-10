const express = require('express');
const app = express();

app.use(express.json()); // Parse JSON requests

app.get('/', (req, res) => {
  res.send('DealerSync Backend Running');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});