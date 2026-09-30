import { sheetsRequest, writeSheetValues } from '../lib/google-sheets-api';
import { salesHeaders, expenseHeaders } from '../lib/google-sheets-sync';

async function main() {
  const book = await sheetsRequest('?fields=sheets.properties');
  const sheets: {properties:{sheetId:number;title:string}}[] = book.sheets;
  const requests: object[] = [];
  if (sheets.length === 1 && sheets[0].properties.title === 'Lapa1') {
    requests.push({updateSheetProperties:{properties:{sheetId:sheets[0].properties.sheetId,title:'Sales'},fields:'title'}});
    requests.push({addSheet:{properties:{title:'Expenses'}}});
  } else if (sheets.length !== 2 || !['Sales','Expenses'].every(name => sheets.some(s => s.properties.title === name))) {
    throw new Error('Unexpected spreadsheet tabs; stopped without deleting anything.');
  }
  if (requests.length) await sheetsRequest(':batchUpdate','POST',{requests});
  const ready = await sheetsRequest('?fields=sheets.properties');
  const formatting: object[] = [];
  for (const sheet of ready.sheets) {
    const sheetId = sheet.properties.sheetId, sales = sheet.properties.title === 'Sales';
    const endColumnIndex = sales ? 17 : 9;
    await writeSheetValues(`${sheet.properties.title}!A1`,[sales ? salesHeaders : expenseHeaders]);
    formatting.push(
      {updateSheetProperties:{properties:{sheetId,gridProperties:{frozenRowCount:1,frozenColumnCount:1}},fields:'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'}},
      {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1,endColumnIndex},cell:{userEnteredFormat:{backgroundColor:{red:0.12,green:0.23,blue:0.28},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}},
      {updateDimensionProperties:{range:{sheetId,dimension:'ROWS',startIndex:0,endIndex:1},properties:{pixelSize:64},fields:'pixelSize'}},
      {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:endColumnIndex},properties:{pixelSize:155},fields:'pixelSize'}},
      {repeatCell:{range:{sheetId,startRowIndex:1,startColumnIndex:1,endColumnIndex:2},cell:{userEnteredFormat:{numberFormat:{type:'DATE_TIME',pattern:'yyyy-mm-dd hh:mm:ss'}}},fields:'userEnteredFormat.numberFormat'}},
      {repeatCell:{range:{sheetId,startRowIndex:1,startColumnIndex:sales?6:5,endColumnIndex:sales?7:6},cell:{userEnteredFormat:{numberFormat:{type:'CURRENCY',pattern:'"€"#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}}
    );
    if(sales) formatting.push(
      {repeatCell:{range:{sheetId,startRowIndex:1,startColumnIndex:7,endColumnIndex:13},cell:{userEnteredFormat:{numberFormat:{type:'PERCENT',pattern:'0.00%'}}},fields:'userEnteredFormat.numberFormat'}},
      {repeatCell:{range:{sheetId,startRowIndex:1,startColumnIndex:13,endColumnIndex:16},cell:{userEnteredFormat:{numberFormat:{type:'CURRENCY',pattern:'"€"#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}}
    );
  }
  await sheetsRequest(':batchUpdate','POST',{requests:formatting});
  console.log('Sales and Expenses tabs and formatting configured.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Spreadsheet setup failed.'); process.exitCode=1; });
