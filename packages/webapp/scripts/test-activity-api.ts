const payload = {
    metadata: {
        device_id: "test-device-123",
        source_app: "com.test.app",
        sync_timestamp: new Date().toISOString()
    },
    activities: [
        {
            id: "550e8400-e29b-41d4-a716-446655440000",
            type: "heart_rate",
            timestamp: Date.now(),
            data: {
                bpm: 75.5,
                accuracy: 2
            }
        },
        {
            id: "550e8400-e29b-41d4-a716-446655440001",
            type: "steps",
            startTime: Date.now() - 300000,
            endTime: Date.now(),
            data: {
                count: 500,
                distance_meters: 400
            }
        },
        {
            id: "550e8400-e29b-41d4-a716-446655440002",
            type: "exercise",
            startTime: Date.now() - 3600000,
            endTime: Date.now(),
            data: {
                exercise_type: "running",
                duration_minutes: 60,
                calories_kcal: 600,
                title: "Morning Run"
            }
        }
    ]
};

async function testApi() {
    console.log("Testing POST /api/activities...");
    try {
        const response = await fetch("http://localhost:3000/api/activities", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Body:", JSON.stringify(data, null, 2));

        if (response.status === 200 && data.success) {
            console.log("✅ Test Passed!");
        } else {
            console.log("❌ Test Failed!");
        }
    } catch (error) {
        console.error("❌ Test Error:", error);
    }
}

testApi();
