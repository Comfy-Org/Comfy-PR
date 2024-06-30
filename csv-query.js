import fs from 'fs';
import csv from 'csv-parser';

const staleLimit = 180;

const processCSV = (filePath) => {
    let total = 0;
    let staleCount = 0;
    let onRegistry = 0;
    let mergedOrClosed = 0;
    let open = 0;
    let openZero = 0;
    let openOne = 0;
    let openTwo = 0;


    fs.createReadStream(filePath).pipe(csv()).on('data', (row) => {
        if(total === 0)
            console.log("row:" , row);
        if(convertToDays(row.repo_updated) >= staleLimit)
            staleCount++;        
        if(row.on_registry === 'true')
            onRegistry++;
        if((row.state === 'MERGED' || row.state === 'CLOSED') && row.on_registry === 'false')
            mergedOrClosed++;
        if(row.state === 'OPEN' && row.on_registry === 'false'){
            // console.log("row.comments: ", row.comments)
            open++;
            if(row.comments == 0){openZero++;
                // console.log("row: ", row)
            }
            if(row.comments == 1)openOne++;
            if(row.comments >= 2)openTwo++;
        }
        
            
            
        total++;
        
    }).on(`end`, () => {
        console.log("Total Nodes: ", Math.floor(total/2));
        console.log("Total Stale Nodes: ", Math.floor(staleCount/2));
        console.log("Total Active Nodes: ", Math.floor(total/2) - Math.floor(staleCount/2));
        console.log("-------------------------------------")
        console.log("On Registry: ", Math.floor(onRegistry/2));
        console.log("Open PRs: ", Math.floor(open/2))
        console.log("Merged/Closed: ", Math.floor(mergedOrClosed/2))
        console.log("-------------------------------------")
        console.log("No FU Yet (Sending to Rule 1): ", Math.floor(openZero/2))
        console.log("1 PR Comment on GH (Sending to Rule 2): ", Math.floor(openOne/2))
        console.log("2+ PR Comments --> Other Social Media (Sending to Rule 3): ", Math.floor(openTwo/2))

        // console.log(Math.floor(onRegistry/2) + Math.floor(open/2) + Math.floor(mergedOrClosed/2))
    })
}

const convertToDays = (value) => {
    const unit = value[value.indexOf('ago')-2]
    const number = parseInt(value, 10);

    if (unit === 'd') {
        return number;
    } else if (unit === 'h') {
        return number / 24; // Convert hours to days
    } else {
        throw new Error(`Unexpected unit: ${unit}`);
    }
}


processCSV('./dump.csv');

