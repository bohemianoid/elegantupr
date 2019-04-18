const path = require('path')

const express = require('express')

const app = express()
const PORT = process.env.PORT || 5001

app
  .use(express.static(path.join(__dirname, 'public')))
  .listen(PORT, () => console.log(`Listening on port ${ PORT }!`))
