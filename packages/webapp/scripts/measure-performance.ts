// Performance measurement script for dashboard APIs

async function measureEndpoint(url: string, label: string) {
    const start = Date.now();
    try {
        const res = await fetch(url);
        const end = Date.now();
        const data = await res.json();
        console.log(`${label}: ${end - start}ms (${res.status})`);
        return { label, time: end - start, status: res.status, dataSize: JSON.stringify(data).length };
    } catch (error) {
        const end = Date.now();
        console.error(`${label}: FAILED after ${end - start}ms`, error);
        return { label, time: end - start, status: 'error', error };
    }
}

async function main() {
    console.log('Measuring dashboard API performance...\n');

    const windowSize = 180; // 3 hours
    const bucketSize = 5;

    const results = [];

    // Main history endpoint
    results.push(await measureEndpoint(
        `http://localhost:3000/api/history?windowSize=${windowSize}&bucketSize=${bucketSize}`,
        'History API (3h, 5min buckets)'
    ));

    // Activity endpoints
    results.push(await measureEndpoint(
        'http://localhost:3000/api/activity/summary',
        'Activity Summary'
    ));

    results.push(await measureEndpoint(
        `http://localhost:3000/api/activity/history?windowSize=${windowSize}`,
        'Activity History (3h)'
    ));

    // Individual status call for comparison
    results.push(await measureEndpoint(
        'http://localhost:3000/api/status',
        'Single Status Call'
    ));

    console.log('\n=== Summary ===');
    const total = results.reduce((sum, r) => sum + (r.time || 0), 0);
    console.log(`Total time: ${total}ms`);
    console.log(`Average: ${Math.round(total / results.length)}ms per endpoint`);

    results.forEach(r => {
        if (r.dataSize) {
            console.log(`${r.label}: ${(r.dataSize / 1024).toFixed(1)}KB`);
        }
    });
}

main().catch(console.error);
