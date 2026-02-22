import { connectToDatabase } from './lib/db/connection';
import { resolveActiveProfile, getProfileStore } from './lib/logic/profile-logic';

async function main() {
    await connectToDatabase();

    const profileInfo = await resolveActiveProfile(new Date());
    console.log("Profile resolved:", !!profileInfo);
    if (profileInfo) {
        console.log("Active Profile Name:", profileInfo.activeProfileName);
        console.log("Is Freddy:", profileInfo.isFreddy);
        const store = getProfileStore(profileInfo?.doc || undefined, profileInfo?.activeProfileName, profileInfo?.profileData || undefined);
        console.log("Store found:", !!store);
        if (store) {
            console.log("Units:", store.units);
            console.log("DIA:", store.dia);
        }
    } else {
        console.log("No profile resolved!");
    }

    process.exit(0);
}

main().catch(console.error);
