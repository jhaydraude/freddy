function activity(t, tau) {
    if (t < 0) return 0;
    return (t / (tau * tau)) * Math.exp(-t / tau);
}

function testIOB(dia_hr, peak_min) {
    const td = dia_hr * 60;
    const tau = peak_min;

    let sum = 0;
    for (let t = 0; t < td; t++) {
        sum += activity(t, tau);
    }

    // Normalize
    const S = 1 / sum;

    console.log(`DIA: ${dia_hr}h, Peak: ${peak_min}min`);
    for (let t = 0; t <= td; t += 30) {
        let partialSum = 0;
        for (let i = 0; i < t; i++) {
            partialSum += activity(i, tau);
        }
        const iob = 1 - (partialSum * S);
        console.log(`t=${t}min: IOB=${iob.toFixed(3)}`);
    }
}

testIOB(5, 55);
