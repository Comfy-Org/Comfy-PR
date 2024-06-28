import fs from 'fs';
import csv from 'csv-parser';

const staleLimit = 180;

const processCSV = (filePath) => {
    const repoValues = [];

    fs.createReadStream(filePath).pipe(csv()).on('data', (row) => {
        if(row.repo_updated){
            repoValues.push(row.repo_updated);
        }
        
    }).on(`end`, () => {
        const activeRepos = repoValues.filter(value => {
            const days = convertToDays(value);
            return days < staleLimit
        })

        const staleRepos = repoValues.filter(value => {
            const days = convertToDays(value);
            return days >= staleLimit
        })

        console.log("Total Repos: ", repoValues.length/2);
        console.log("Active Repos: ", activeRepos.length/2);
        console.log("Stale Repos: ", staleRepos.length/2);
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

