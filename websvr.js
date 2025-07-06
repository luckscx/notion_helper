const express = require('express');
const app = express();
const {exec} = require('child_process');

app.get('/', function(req, res) {
  const opt = {
    root : "./static",
  }
  res.sendFile('/hello.html', opt);
});

function do_cmd(shell_path, res) {
  console.log("do_cmd", shell_path)
  exec("sh " + shell_path, (error, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
    if (res) {
      res.send(stdout)
    }
  })
}

app.post('/daily', function(req, res) {
  do_cmd("daily.sh", res)
});

app.post('/book', function(req, res) {
  do_cmd("book.sh", res)
});

app.post('/movie', function(req, res) {
  do_cmd("movie.sh", res)
});

// 刷新书籍 异步执行
app.post('/book_refresh', function(req, res) {
  do_cmd("book.sh")
  res.send("ok")
});

const port = 8089
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
