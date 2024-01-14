const axios = require('axios');

const launchesDatabase = require('./launches.mongo');
const planets = require('./planets.mongo');

const DEFAULT_FLIGHT_NUMBER = 100;

const SPACEX_API_URL = 'https://api.spacexdata.com/v4/launches/query';

async function populateLaunches() {

    console.log('downloading launch data...');
    const response = await axios.post(SPACEX_API_URL, {
        query : {},
        options : {
            pagination: false,
            populate : [
                {
                    path : 'rocket',
                    select : {
                        name : 1
                    }
                },
                {
                    path: 'payloads',
                    select : {
                        'customers': 1
                    }
                }
            ]
        }
    });

    if ( response.status !== 200 ) {
        console.log('Problem downloading launch data');
        throw new Error('Launch data download failed');
    }

    const launchData = response.data.docs;
    for ( const launchDocs of launchData) {
        const payloads = launchDocs['payloads'];
        const customers = payloads.flatMap((payload) => {
            return payload['customers'];
        });

        const launch = {
            flightNumber: launchDocs['flight_number'],
            mission: launchDocs['name'],
            rocket: launchDocs['rocket']['name'],
            launchDate: launchDocs['date_local'],
            upcoming: launchDocs['upcoming'],
            success: launchDocs['success'],
            customers,
        };
        console.log(launch.flightNumber+' '+launch.mission);
        
        await saveLaunch(launch);
    }
}

async function loadLaunchesData() {
    const firstLaunch = await findLaunch({
        flightNumber: 1,
        rocket: 'Falcon 1',
        mission: 'FalconSat'
    });

    if(firstLaunch) {
        console.log('launch data already loaded');
    } else {
        await populateLaunches();
    }
}

async function findLaunch(filter) {
    return await launchesDatabase.findOne(filter);
}

async function existLaunchWithId(launchId) {
    return await findLaunch({
        flightNumber: launchId
    })
}

async function saveLaunch(launch) {
    await launchesDatabase.findOneAndUpdate({
        flightNumber: launch.flightNumber,
    }, launch, {
        upsert: true,
    })
}

async function getLatestFlightNumber() {
    const latestLaunch = await launchesDatabase
    .findOne()
    .sort('-flightNumber');
    if(!latestLaunch) {
        return DEFAULT_FLIGHT_NUMBER;
    }
    return latestLaunch.flightNumber;
}

async function getAllLaunches(skip, limit) {
    return await launchesDatabase.find({} ,{
        '__id': 0, '__v': 0
    })
    .sort({flightNumber: 1})
    .skip(skip)
    .limit(limit);
}

async function scheduleNewLaunch(launch) {
    const planet = await planets.findOne({
        keplerName: launch.target,
    });

    if(!planet) {
        console.log('No planet match found');
    }


    const newFlightNumber = await getLatestFlightNumber() + 1;
    const newLaunch = Object.assign(launch, {
        success: true,
        upcoming: true,
        customers: ['Zero to Mastery', 'NASA'],
        flightNumber: newFlightNumber,
    });
    await saveLaunch(newLaunch);
}

async function abortLaunchById(launchId) {
    const aborted =  await launchesDatabase.updateOne({
        flightNumber: launchId,
    }, {
        upcoming: false,
        success: false
    });

    return aborted.modifiedCount === 1;
}

module.exports = {
    getAllLaunches,
    scheduleNewLaunch,
    existLaunchWithId,
    abortLaunchById,
    loadLaunchesData
}