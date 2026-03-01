const fs = require('fs');

// The trace directory contains types.json
const types = JSON.parse(fs.readFileSync('trace/types.json', 'utf8'));

function printType(id) {
    const t = types.find(x => x.id === id);
    if (t) {
        console.log(`Type ${id}:`, JSON.stringify(t, null, 2));
    } else {
        console.log(`Type ${id} not found`);
    }
}

printType(275450);
printType(63038);
printType(36189);
printType(274819);
printType(274808);
