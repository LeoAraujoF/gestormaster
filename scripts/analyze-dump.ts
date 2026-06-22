import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('clientes_dump.html', 'utf8');
const $ = cheerio.load(html);

console.log('Select options for Status:');
$('select[name="status"] option').each((_, el) => {
  console.log(`Value: ${$(el).attr('value')} | Text: ${$(el).text()}`);
});

console.log('\nOther selects:');
$('select').each((_, el) => {
  console.log(`Name: ${$(el).attr('name')}`);
});
