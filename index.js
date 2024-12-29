
const superagent = require('superagent');
const cheerio = require('cheerio');
const url = "https://www.mobygames.com/game/65001/hearthstone-heroes-of-warcraft/";

function getPublisher($) {
  let publisher = ""
  let developer = ""
  $('.info-release .metadata').children().each((index, ele) => {
    const child = $(ele);
    let ttt = child.text().trim();
    if (ttt === "Publishers") {
      publisher = child.next().text().trim()
    }
    if (ttt === "Developers") {
      developer = child.next().text().trim()
    }
  });
  return {publisher, developer}
}

const main = async () => {
  const html = await superagent.get(url);

  const $ = cheerio.load(html.text);

  let {publisher, developer} = getPublisher($);
  console.log(publisher, developer)
}

main()


