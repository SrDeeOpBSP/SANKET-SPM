const spmConfig = {
    type: 'Telpro',
    eventCodes: { zeroSpeed: 'STOP' },
    brakeTests: {
        GOODS: { bft: { minSpeed: 20, maxSpeed: 30, maxDuration: 60 * 1000 }, bpt: { minSpeed: 40, maxSpeed: 50, maxDuration: 60 * 1000 } },
        COACHING: { bft: { minSpeed: 20, maxSpeed: 30, maxDuration: 60 * 1000 }, bpt: { minSpeed: 50, maxSpeed: 60, maxDuration: 60 * 1000 } },
        MEMU: { bft: { minSpeed: 20, maxSpeed: 30, maxDuration: 60 * 1000 }, bpt: { minSpeed: 50, maxSpeed: 60, maxDuration: 60 * 1000 } }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

/**
 * CUG CSV file ko parse karta hai aur date/time fields ko process karta hai.
 * @param {File} file User dwara upload ki gayi CUG.csv file.
 * @returns {Promise<Array>} Ek promise jo processed CUG data ke saath resolve hota hai.
 */
const parseAndProcessCugData = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error('CUG file is missing.'));
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transform: (value) => value.trim(),
            complete: (result) => {
                if (result.errors.length) {
                    console.error('Errors parsing CUG.csv:', result.errors);
                    return reject(new Error('Failed to parse CUG.csv. Check file format.'));
                }
                
                const processedData = result.data.map(call => {
                    const startDateTimeStr = call['Start Date & Time']?.trim();
                    const endDateTimeStr = call['End Date & Time']?.trim();
                    const dateTimeRegex = /^(?:(\d{2})[-\/](\d{2})[-\/](\d{4})|(\d{4})[-\/](\d{2})[-\/](\d{2}))\s(\d{2}):(\d{2})(?::(\d{2}))?$/;
                    const startMatch = startDateTimeStr?.match(dateTimeRegex);
                    const endMatch = endDateTimeStr?.match(dateTimeRegex);

                    if (startMatch && endMatch) {
                        let startDateTime, endDateTime;
                        const startSeconds = startMatch[9] || '00';
                        const endSeconds = endMatch[9] || '00';

                        if (startMatch[1]) { // DD-MM-YYYY format
                            startDateTime = new Date(`${startMatch[3]}-${startMatch[2]}-${startMatch[1]}T${startMatch[7]}:${startMatch[8]}:${startSeconds}`);
                            endDateTime = new Date(`${endMatch[3]}-${endMatch[2]}-${endMatch[1]}T${endMatch[7]}:${endMatch[8]}:${endSeconds}`);
                        } else { // YYYY-MM-DD format
                            startDateTime = new Date(`${startMatch[4]}-${startMatch[5]}-${startMatch[6]}T${startMatch[7]}:${startMatch[8]}:${startSeconds}`);
                            endDateTime = new Date(`${endMatch[4]}-${endMatch[5]}-${endMatch[6]}T${endMatch[7]}:${endMatch[8]}:${endSeconds}`);
                        }

                        return {
                            ...call,
                            startDateTime,
                            endDateTime,
                            duration: parseInt(call['Duration in Sec']) || 0,
                            'CUG MOBILE NO': call['CUG MOBILE NO']?.trim()
                        };
                    }
                    console.warn('Invalid date format in CUG.csv row:', call);
                    return null;
                }).filter(call => call && call.startDateTime && !isNaN(call.startDateTime.getTime()));
                
                resolve(processedData);
            },
            error: (error) => reject(error)
        });
    });
};
document.getElementById('spmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alert('Processing SPM file, please wait...');

    if (speedChartInstance) speedChartInstance.destroy();
    if (stopChartInstance) stopChartInstance.destroy();

    const lpId = document.getElementById('lpId').value.trim();
        const lpName = document.getElementById('lpName').value.trim();
        const lpDesg = document.getElementById('lpDesg').value.trim();
        const lpGroupCli = document.getElementById('lpGroupCli').value.trim();
        const lpCugNumber = document.getElementById('lpCugNumber').value.trim();
        const alpId = document.getElementById('alpId').value.trim();
        const alpName = document.getElementById('alpName').value.trim();
        const alpDesg = document.getElementById('alpDesg').value.trim();
        const alpGroupCli = document.getElementById('alpGroupCli').value.trim();
        const alpCugNumber = document.getElementById('alpCugNumber').value.trim();
        const locoNumber = document.getElementById('locoNumber').value.trim();
        const trainNumber = document.getElementById('trainNumber').value.trim();
        const rakeType = document.getElementById('rakeType').value;
        const maxPermissibleSpeed = parseInt(document.getElementById('maxPermissibleSpeed').value);
        const section = document.getElementById('section').value;
        const fromSection = document.getElementById('fromSection').value.toUpperCase();
        const toSection = document.getElementById('toSection').value.toUpperCase();
        const routeSection = `${fromSection}-${toSection}`;
        const spmType = document.getElementById('spmType').value;
        const fromDateTime = new Date(document.getElementById('fromDateTime').value);
        const toDateTime = new Date(document.getElementById('toDateTime').value);
        const spmFile = document.getElementById('spmFile').files[0];
        const cugFile = document.getElementById('cugFile').files[0];

    if (toDateTime <= fromDateTime) {
        alert('To Date and Time must be later than From Date and Time.');
        return;
    }

    if (fromSection === toSection) {
        alert('From Section and To Section cannot be the same.');
        return;
    }

    if (lpCugNumber === alpCugNumber && lpCugNumber !== '') {
        alert('LP and ALP cannot have the same CUG number. Please check the CREW.csv file.');
        return;
    }

    const cugData = await parseAndProcessCugData(cugFile);
        console.log("Processed CUG Data inside Medha.js:", cugData);

        const lpCalls = cugData.filter(call => {
            const matchesNumber = call['CUG MOBILE NO'] === lpCugNumber;
            const withinTime = call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime;
            return matchesNumber && withinTime;
        });

        const alpCalls = cugData.filter(call => {
            const matchesNumber = call['CUG MOBILE NO'] === alpCugNumber;
            const withinTime = call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime;
            return matchesNumber && withinTime;
        });

        console.log('LP Calls found:', lpCalls.length);
        console.log('ALP Calls found:', alpCalls.length);

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

            let normalizedData = [];
            let cumulativeDistanceMeters = 0;
            jsonData.forEach((row, index) => {
                if (row[0] && row[0].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                    const date = row[0];
                    const time = row[1];
                    const distanceIncrement = parseFloat(row[2]) || 0;
                    const speed = parseFloat(row[3]) || 0;
                    const event = row[11] ? String(row[11]).trim().toUpperCase() : '';

                    cumulativeDistanceMeters += distanceIncrement;
                    const timestamp = new Date(`${date.split('/').reverse().join('-')}T${time}`);
                    if (!isNaN(timestamp.getTime())) {
                        normalizedData.push({
                            Time: timestamp,
                            Distance: cumulativeDistanceMeters,
                            Speed: speed,
                            EventGn: event
                        });
                    }
                }
            });

            console.log('Normalized Data Sample:', normalizedData.slice(0, 5));
            console.log('Last Normalized Data:', normalizedData.slice(-5));
            console.log('Total Cumulative Distance (m):', cumulativeDistanceMeters);

            let initialFilteredData = normalizedData.filter(row => row.Time >= fromDateTime && row.Time <= toDateTime);
            normalizedData = initialFilteredData.length > 0 ? initialFilteredData : normalizedData;

            console.log('Initial Filtered Data Length:', normalizedData.length);

            const stationMap = new Map();
            window.stationSignalData
                .filter(row => row['SECTION'] === section)
                .forEach(row => {
                    const name = row['STATION'];
                    const distance = parseFloat(row['CUMMULATIVE DISTANT(IN Meter)']) || 0;
                    if (!stationMap.has(name)) {
                        stationMap.set(name, { name, distance });
                    }
                });
            const stationsData = Array.from(stationMap.values());

            console.log('Stations Data for Section:', stationsData);

            const fromStation = stationsData.find(station => station.name === fromSection);
            if (!fromStation) {
                alert(`Selected From Station (${fromSection}) is not valid for the chosen Section (${section}).`);
                return;
            }

            const fromDistance = fromStation.distance;
            normalizedData.forEach(row => {
                row.NormalizedDistance = row.Distance - fromDistance;
            });

            let departureIndex = normalizedData.findIndex((row, i) => {
                if (row.Time < fromDateTime || row.Time > toDateTime || row.Speed < 1) return false;
                let distanceMoved = 0;
                let startDistance = row.Distance;
                for (let j = i; j < normalizedData.length; j++) {
                    const currentSpeed = normalizedData[j].Speed;
                    if (currentSpeed === 0) return false;
                    distanceMoved += Math.abs(normalizedData[j].Distance - startDistance);
                    startDistance = normalizedData[j].Distance;
                    if (distanceMoved >= 200) return true;
                }
                return false;
            });

            if (departureIndex === -1) {
                alert('No valid departure found in the time range (Speed >= 1 km/h with 200m continuous movement without zero speed).');
                return;
            }

            const departureTime = normalizedData[departureIndex].Time;
            console.log('Departure Time:', departureTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }));

            let filteredData = normalizedData.filter(row => {
                const rowTime = row.Time;
                return rowTime >= departureTime && rowTime <= toDateTime && !isNaN(rowTime.getTime());
            });

            if (filteredData.length === 0) {
                alert('No valid data found after departure.');
                return;
            }

            const initialDistance = filteredData[0].NormalizedDistance;
            normalizedData = filteredData.map(row => ({
                ...row,
                Distance: row.NormalizedDistance - initialDistance
            }));

            console.log('Normalized Data (first 5):', normalizedData.slice(0, 5));

            const fromIndex = stationsData.findIndex(station => station.name === fromSection);
            const toIndex = stationsData.findIndex(station => station.name === toSection);
            if (fromIndex === -1 || toIndex === -1) {
                alert(`Invalid From (${fromSection}) or To (${toSection}) Station.`);
                return;
            }

            const routeStations = [];
            const routeStartIndex = Math.min(fromIndex, toIndex);
            const endIndex = Math.max(fromIndex, toIndex);
            for (let i = routeStartIndex; i <= endIndex; i++) {
                routeStations.push(stationsData[i]);
            }

            let normalizedStations = routeStations.map(station => ({
                name: station.name,
                distance: Math.abs(station.distance - fromStation.distance)
            }));

            console.log('Normalized Stations:', normalizedStations);

            const overSpeedDetails = [];
            let overSpeedGroup = null;
            normalizedData.forEach((row, index) => {
                if (row.Speed > maxPermissibleSpeed) {
                    let sectionName = 'Unknown';
                    for (let i = 0; i < normalizedStations.length - 1; i++) {
                        const startStation = normalizedStations[i];
                        const endStation = normalizedStations[i + 1];
                        const rowDistanceM = row.Distance;
                        if (rowDistanceM >= startStation.distance && rowDistanceM < endStation.distance) {
                            sectionName = `${startStation.name}-${endStation.name}`;
                            break;
                        }
                    }
                    if (sectionName === 'Unknown') {
                        const atStationOrSignal = window.stationSignalData.find(signalRow => {
                            if (signalRow['SECTION'] !== section) return false;
                            const signalDistance = parseFloat(signalRow['CUMMULATIVE DISTANT(IN Meter)']) - fromDistance;
                            const rangeStart = signalDistance - 400;
                            const rangeEnd = signalDistance + 400;
                            const rowDistanceM = row.Distance;
                            return rowDistanceM >= rangeStart && rowDistanceM <= rangeEnd;
                        });
                        if (atStationOrSignal) {
                            sectionName = `${atStationOrSignal['STATION']} ${atStationOrSignal['SIGNAL NAME'] || ''}`.trim();
                        }
                    }

                    if (!overSpeedGroup || overSpeedGroup.section !== sectionName || 
                        (index > 0 && (row.Time - normalizedData[index-1].Time) > 10000)) {
                        if (overSpeedGroup) {
                            overSpeedDetails.push({
                                section: overSpeedGroup.section,
                                timeRange: `${overSpeedGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}-${overSpeedGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                                speedRange: `${overSpeedGroup.minSpeed.toFixed(2)}-${overSpeedGroup.maxSpeed.toFixed(2)}`
                            });
                        }
                        overSpeedGroup = {
                            section: sectionName,
                            startTime: row.Time,
                            endTime: row.Time,
                            minSpeed: row.Speed,
                            maxSpeed: row.Speed
                        };
                    } else {
                        overSpeedGroup.endTime = row.Time;
                        overSpeedGroup.minSpeed = Math.min(overSpeedGroup.minSpeed, row.Speed);
                        overSpeedGroup.maxSpeed = Math.max(overSpeedGroup.maxSpeed, row.Speed);
                    }
                }
            });

            if (overSpeedGroup) {
                overSpeedDetails.push({
                    section: overSpeedGroup.section,
                    timeRange: `${overSpeedGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}-${overSpeedGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                    speedRange: `${overSpeedGroup.minSpeed.toFixed(2)}-${overSpeedGroup.maxSpeed.toFixed(2)}`
                });
            }

            console.log('OverSpeed Details:', overSpeedDetails);

            const wheelSlipDetails = [];
            const wheelSkidDetails = [];
            let wheelSlipGroup = null;
            let wheelSkidGroup = null;

            normalizedData.forEach((row, index) => {
                if (index === 0) return;
                const prevRow = normalizedData[index - 1];
                const timeDiffSec = (row.Time - prevRow.Time) / 1000;
                if (timeDiffSec > 1) return;

                const speedDiff = row.Speed - prevRow.Speed;
                let sectionName = 'Unknown';
                for (let i = 0; i < normalizedStations.length - 1; i++) {
                    const startStation = normalizedStations[i];
                    const endStation = normalizedStations[i + 1];
                    const rowDistanceM = row.Distance;
                    if (rowDistanceM >= startStation.distance && rowDistanceM < endStation.distance) {
                        sectionName = `${startStation.name}-${endStation.name}`;
                        break;
                    }
                }
                if (sectionName === 'Unknown') {
                    const atStationOrSignal = window.stationSignalData.find(signalRow => {
                        if (signalRow['SECTION'] !== section) return false;
                        const signalDistance = parseFloat(signalRow['CUMMULATIVE DISTANT(IN Meter)']) - fromDistance;
                        const rangeStart = signalDistance - 400;
                        const rangeEnd = signalDistance + 400;
                        const rowDistanceM = row.Distance;
                        return rowDistanceM >= rangeStart && rowDistanceM <= rangeEnd;
                    });
                    if (atStationOrSignal) {
                        sectionName = `${atStationOrSignal['STATION']} ${atStationOrSignal['SIGNAL NAME'] || ''}`.trim();
                    }
                }

                if (speedDiff >= 2) {
                    if (!wheelSlipGroup || wheelSlipGroup.section !== sectionName || 
                        (row.Time - prevRow.Time) > 10000) {
                        if (wheelSlipGroup) {
                            wheelSlipDetails.push({
                                section: wheelSlipGroup.section,
                                timeRange: `${wheelSlipGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}-${wheelSlipGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                                speedRange: `${wheelSlipGroup.minSpeed.toFixed(2)}-${wheelSlipGroup.maxSpeed.toFixed(2)}`
                            });
                        }
                        wheelSlipGroup = {
                            section: sectionName,
                            startTime: prevRow.Time,
                            endTime: row.Time,
                            minSpeed: prevRow.Speed,
                            maxSpeed: row.Speed
                        };
                    } else {
                        wheelSlipGroup.endTime = row.Time;
                        wheelSlipGroup.maxSpeed = Math.max(wheelSlipGroup.maxSpeed, row.Speed);
                    }
                }

                if (speedDiff <= -4) {
                    if (!wheelSkidGroup || wheelSkidGroup.section !== sectionName || 
                        (row.Time - prevRow.Time) > 10000) {
                        if (wheelSkidGroup) {
                            wheelSkidDetails.push({
                                section: wheelSkidGroup.section,
                                timeRange: `${wheelSkidGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}-${wheelSkidGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                                speedRange: `${wheelSkidGroup.maxSpeed.toFixed(2)}-${wheelSkidGroup.minSpeed.toFixed(2)}`
                            });
                        }
                        wheelSkidGroup = {
                            section: sectionName,
                            startTime: prevRow.Time,
                            endTime: row.Time,
                            minSpeed: row.Speed,
                            maxSpeed: prevRow.Speed
                        };
                    } else {
                        wheelSkidGroup.endTime = row.Time;
                        wheelSkidGroup.minSpeed = Math.min(wheelSkidGroup.minSpeed, row.Speed);
                    }
                }
            });

            if (wheelSlipGroup) {
                wheelSlipDetails.push({
                    section: wheelSlipGroup.section,
                    timeRange: `${wheelSlipGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}-${wheelSlipGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                    speedRange: `${wheelSlipGroup.minSpeed.toFixed(2)}-${wheelSlipGroup.maxSpeed.toFixed(2)}`
                });
            }

            if (wheelSkidGroup) {
                wheelSkidDetails.push({
                    section: wheelSkidGroup.section,
                    timeRange: `${wheelSkidGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}-${wheelSkidGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                    speedRange: `${wheelSkidGroup.maxSpeed.toFixed(2)}-${wheelSkidGroup.minSpeed.toFixed(2)}`
                });
            }

            console.log('Wheel Slip Details:', wheelSlipDetails);
            console.log('Wheel Skid Details:', wheelSkidDetails);

            // Updated Crew Call Analysis
            const analyzeCalls = (calls, designation) => {
                    if (!calls || calls.length === 0) {
                        return [];
                    }
                    return calls.map((call, index) => {
                        const callStart = call.startDateTime;
                        const callEnd = call.endDateTime;
                        const totalDuration = call.duration;
                        let runDuration = 0;
                        let stopDuration = 0;
                        let maxSpeed = 0;

                        for (let i = 0; i < normalizedData.length; i++) {
                            const rowTime = normalizedData[i].Time;
                            if (rowTime >= callStart && rowTime <= callEnd) {
                                const timeDiff = i < normalizedData.length - 1 ?
                                    (normalizedData[i + 1].Time - rowTime) / 1000 :
                                    1;
                                if (normalizedData[i].Speed > 1) {
                                    runDuration += timeDiff;
                                    maxSpeed = Math.max(maxSpeed, normalizedData[i].Speed);
                                } else {
                                    stopDuration += timeDiff;
                                }
                            }
                        }

                        const totalCalculated = runDuration + stopDuration;
                        if (totalCalculated > 0) {
                            runDuration = (runDuration / totalCalculated) * totalDuration;
                            stopDuration = (stopDuration / totalCalculated) * totalDuration;
                        } else {
                            stopDuration = totalDuration;
                        }

                        return {
                            designation: `${designation} (Call ${index + 1})`,
                            totalDuration: totalDuration > 0 ? Math.round(totalDuration) : 'N/A',
                            runDuration: runDuration > 0 ? Math.round(runDuration) : 'N/A',
                            stopDuration: stopDuration > 0 ? Math.round(stopDuration) : 'N/A',
                            maxSpeed: runDuration > 0 ? maxSpeed.toFixed(2) : 'N/A',
                            toNumbers: call['To Mobile Number'] || 'N/A'
                        };
                    });
                };

                const lpCallDetails = analyzeCalls(lpCalls, lpDesg || 'LP');
                const alpCallDetails = analyzeCalls(alpCalls, alpDesg || 'ALP');
                const crewCallData = [...lpCallDetails, ...alpCallDetails];
                console.log('Crew Call Data:', crewCallData);

            let stops = [];
            let stopGroup = 0;
            let potentialStops = [];
            for (let i = 0; i < normalizedData.length; i++) {
                const row = normalizedData[i];
                if (row.EventGn === spmConfig.eventCodes.zeroSpeed && row.Speed === 0) {
                    potentialStops.push({
                        index: i,
                        time: row.Time,
                        timeString: row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                        timeLabel: row.Time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                        kilometer: row.Distance
                    });
                }
            }

            console.log('Potential Stops:', potentialStops.length);

            const seenStops = new Set();
            let currentGroup = [];
            for (let i = 0; i < potentialStops.length; i++) {
                currentGroup.push(potentialStops[i]);
                const isLastInSequence = i === potentialStops.length - 1 || (() => {
                    const nextStop = potentialStops[i + 1];
                    const timeDiff = (nextStop.time - potentialStops[i].time) / 1000;
                    return timeDiff > 10;
                })();

                if (isLastInSequence && currentGroup.length > 0) {
                    const lastStop = currentGroup[currentGroup.length - 1];
                    const stopKey = `${lastStop.kilometer.toFixed(3)}-${lastStop.timeString}`;
                    if (!seenStops.has(stopKey)) {
                        seenStops.add(stopKey);
                        stops.push({
                            ...lastStop,
                            group: ++stopGroup
                        });
                    }
                    currentGroup = [];
                }
            }

            stops = stops.filter((stop, index, arr) => {
                if (index === 0) return true;
                const prevStop = arr[index - 1];
                const distanceDiff = Math.abs(stop.kilometer - prevStop.kilometer);
                return distanceDiff >= 200;
            }).sort((a, b) => a.time.getTime() - b.time.getTime());

            stops.forEach((stop, index) => {
                stop.group = index + 1;
            });

            console.log('Processed Stops:', stops);

            if (stops.length === 0 && !normalizedData.some(row => row.EventGn === spmConfig.eventCodes.zeroSpeed)) {
                console.warn(`No ${spmConfig.eventCodes.zeroSpeed} events found in SPM file.`);
            }

            stops = stops.map(stop => {
                const stopDistance = stop.kilometer;
                let stopLocation = '';
                let startTiming = null;

                const atStationOrSignal = window.stationSignalData.find(row => {
                    if (row['SECTION'] !== section) return false;
                    const signalDistance = parseFloat(row['CUMMULATIVE DISTANT(IN Meter)']) - fromDistance;
                    const rangeStart = signalDistance - 400;
                    const rangeEnd = signalDistance + 400;
                    return stopDistance >= rangeStart && stopDistance <= rangeEnd;
                });

                if (atStationOrSignal) {
                    stopLocation = `${atStationOrSignal['STATION']} ${atStationOrSignal['SIGNAL NAME'] || ''}`.trim();
                } else {
                    let sectionStart = null, sectionEnd = null;
                    for (let i = 0; i < normalizedStations.length - 1; i++) {
                        const startStation = normalizedStations[i];
                        const endStation = normalizedStations[i + 1];
                        if (stopDistance >= startStation.distance && stopDistance < endStation.distance) {
                            sectionStart = startStation.name;
                            sectionEnd = endStation.name;
                            break;
                        }
                    }
                    stopLocation = sectionStart && sectionEnd ? `${sectionStart}-${sectionEnd}` : 'Unknown Section';
                }

                const stopIndex = stop.index;
                for (let i = stopIndex + 1; i < normalizedData.length; i++) {
                    const currentSpeed = normalizedData[i].Speed;
                    const currentTime = normalizedData[i].Time;
                    if ((currentSpeed > 0 || normalizedData[i].EventGn === 'START 11111111') && currentTime > stop.time) {
                        startTiming = currentTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                        break;
                    }
                }

                const distancesBefore = [1000, 500, 100, 50];
                const speedsBefore = distancesBefore.map(targetDistance => {
                    let closestRow = null;
                    let minDistanceDiff = Infinity;
                    for (let i = stop.index; i >= 0; i--) {
                        const row = normalizedData[i];
                        const distanceDiff = stop.kilometer - row.Distance;
                        if (distanceDiff >= targetDistance) {
                            const absDiff = Math.abs(distanceDiff - targetDistance);
                            if (absDiff < minDistanceDiff) {
                                minDistanceDiff = absDiff;
                                closestRow = row;
                            }
                        }
                    }
                    return closestRow ? closestRow.Speed.toFixed(2) : 'N/A';
                });

                const [speed1000, speed500, speed100, speed50] = speedsBefore.map(speed => parseFloat(speed) || Infinity);
                const isSmooth = speed1000 <= 60 && speed500 <= 30 && speed100 <= 20 && speed50 <= 10;
                const brakingTechnique = isSmooth ? 'Smooth' : 'Late';

                return {
                    ...stop,
                    stopLocation,
                    startTiming: startTiming || 'N/A',
                    speedsBefore,
                    brakingTechnique
                };
            });

            console.log('Enhanced Stops:', stops);

            const trackSpeedReduction = (data, startIdx, maxDurationMs) => {
                let lowestSpeed = data[startIdx].Speed;
                let lowestSpeedIdx = startIdx;
                let previousSpeed = data[startIdx].Speed;
                const startTime = data[startIdx].Time.getTime();
                const speedIncreaseThreshold = 1;

                for (let i = startIdx + 1; i < data.length; i++) {
                    const currentTime = data[i].Time.getTime();
                    const timeDiffMs = currentTime - startTime;
                    const currentSpeed = data[i].Speed;

                    if (timeDiffMs > maxDurationMs) {
                        return { index: lowestSpeedIdx, speed: lowestSpeed, timeDiff: (data[lowestSpeedIdx].Time.getTime() - startTime) / 1000 };
                    }

                    if (currentSpeed < lowestSpeed) {
                        lowestSpeed = currentSpeed;
                        lowestSpeedIdx = i;
                    }

                    if (currentSpeed > previousSpeed + speedIncreaseThreshold) {
                        return { index: lowestSpeedIdx, speed: lowestSpeed, timeDiff: (data[lowestSpeedIdx].Time.getTime() - startTime) / 1000 };
                    }

                    previousSpeed = currentSpeed;
                }

                return { index: lowestSpeedIdx, speed: lowestSpeed, timeDiff: (data[lowestSpeedIdx].Time.getTime() - startTime) / 1000 };
            };

            let bftDetails = { time: null, startSpeed: null, endSpeed: null, reduction: null, timeTaken: null, endTime: null };
            let bptDetails = { time: null, startSpeed: null, endSpeed: null, reduction: null, timeTaken: null, endTime: null };

            for (let i = 0; i < normalizedData.length; i++) {
                const row = normalizedData[i];
                const speed = row.Speed;
                const brakeTests = spmConfig.brakeTests[rakeType];

                if (!bftDetails.time && speed >= brakeTests.bft.minSpeed && speed <= brakeTests.bft.maxSpeed) {
                    bftDetails.time = row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    bftDetails.startSpeed = speed;
                    const result = trackSpeedReduction(normalizedData, i, brakeTests.bft.maxDuration);
                    bftDetails.endSpeed = result.speed;
                    bftDetails.timeTaken = result.timeDiff.toFixed(0);
                    bftDetails.endTime = normalizedData[result.index].Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    bftDetails.reduction = (bftDetails.startSpeed - bftDetails.endSpeed).toFixed(2);
                    console.log('BFT Details:', bftDetails);
                }

                if (!bptDetails.time && speed >= brakeTests.bpt.minSpeed && speed <= brakeTests.bpt.maxSpeed) {
                    bptDetails.time = row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    bptDetails.startSpeed = speed;
                    const result = trackSpeedReduction(normalizedData, i, brakeTests.bpt.maxDuration);
                    bptDetails.endSpeed = result.speed;
                    bptDetails.timeTaken = result.timeDiff.toFixed(0);
                    bptDetails.endTime = normalizedData[result.index].Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    bptDetails.reduction = (bptDetails.startSpeed - bptDetails.endSpeed).toFixed(2);
                    console.log('BPT Details:', bptDetails);
                }

                if (bftDetails.time && bptDetails.time) break;
            }

            const maxPoints = 500;
            let sampledData = normalizedData;
            if (normalizedData.length > maxPoints) {
                const step = Math.ceil(normalizedData.length / maxPoints);
                sampledData = normalizedData.filter((_, index) => index % step === 0);
            }

            console.log('Normalized Data Length:', normalizedData.length);
            console.log('Sampled Data Length:', sampledData.length);
            let labels = sampledData.map(row => row.Time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
            let speeds = sampledData.map(row => row.Speed);
            console.log('Labels Length:', labels.length, 'Sample:', labels.slice(0, 5));
            console.log('Speeds Length:', speeds.length, 'Sample:', speeds.slice(0, 5));

            let speedChartImage = null;
            if (labels.length === 0 || speeds.length === 0) {
                console.warn('No valid data for Speed vs Time chart. Using fallback data.');
                labels = ['10:00', '10:01', '10:02', '10:03', '10:04'];
                speeds = [0, 10, 20, 15, 0];
            }

            try {
                const ctx = document.getElementById('speedChart')?.getContext('2d');
                if (!ctx) throw new Error('Speed Chart canvas not found');
                document.getElementById('speedChart').width = 600;
                document.getElementById('speedChart').height = 400;
                speedChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Speed',
                            data: speeds,
                            borderColor: '#00008B',
                            backgroundColor: 'rgba(0, 0, 139, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 2,
                            pointRadius: 0
                        }]
                    },
                    options: {
                        responsive: false,
                        scales: {
                            x: {
                                title: { display: true, text: 'Time' },
                                grid: { display: true, color: '#F5F5F5' },
                                ticks: {
                                    maxTicksLimit: 12,
                                    callback: function(value, index) {
                                        const label = labels[index];
                                        if (stops.map(stop => stop.timeLabel).includes(label)) {
                                            return label;
                                        }
                                        return index % Math.ceil(labels.length / 12) === 0 ? label : '';
                                    }
                                }
                            },
                            y: {
                                title: { display: true, text: 'Speed (kmph)' },
                                grid: { display: true, color: '#E6E6E6' },
                                beginAtZero: true,
                                ticks: { stepSize: 10 }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            title: { display: false }
                        }
                    }
                });

                speedChartImage = await new Promise((resolve) => {
                    speedChartInstance.options.animation = {
                        onComplete: () => {
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = 400;
                            tempCanvas.height = 600;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.translate(400, 0);
                            tempCtx.rotate(Math.PI / 2);
                            const img = new Image();
                            img.src = document.getElementById('speedChart').toDataURL('image/png');
                            img.onload = () => {
                                tempCtx.drawImage(img, 0, 0, 600, 400);
                                const dataUrl = tempCanvas.toDataURL('image/png', 1.0);
                                console.log('Speed Chart Image generated (rotated 90°, 400x600):', dataUrl.substring(0, 50) + '...');
                                resolve(dataUrl);
                            };
                        }
                    };
                    speedChartInstance.update();
                });
            } catch (error) {
                console.error('Error generating Speed vs Time chart:', error);
            }

            let stopChartImage = null;
            const distanceLabels = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0];
            const selectedStops = stops.length > 10 ? stops.slice(0, 10) : stops;
            console.log('Total Stops:', stops.length, 'Selected Stops:', selectedStops.length);

            let stopDatasets = selectedStops.map((stop, index) => {
                const speeds = distanceLabels.map(targetDistance => {
                    let closestRow = null;
                    let minDistanceDiff = Infinity;
                    for (let i = stop.index; i >= 0; i--) {
                        const row = normalizedData[i];
                        const distanceDiff = stop.kilometer - row.Distance;
                        if (distanceDiff >= targetDistance) {
                            const absDiff = Math.abs(distanceDiff - targetDistance);
                            if (absDiff < minDistanceDiff) {
                                minDistanceDiff = absDiff;
                                closestRow = row;
                            }
                        }
                    }
                    return closestRow ? closestRow.Speed : 0;
                });
                console.log(`Stop ${index + 1} Speeds:`, speeds);
                const colors = [
                    '#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080',
                    '#00FFFF', '#FF00FF', '#FFFF00', '#008080', '#FFC0CB'
                ];
                return {
                    label: stop.stopLocation || `Stop ${index + 1}`,
                    data: speeds,
                    borderColor: colors[index % colors.length],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    borderWidth: 2,
                    pointRadius: 3
                };
            });

            if (stopDatasets.length === 0) {
                console.warn('No valid data for Speed vs Distance chart. Using fallback data.');
                stopDatasets = [{
                    label: 'Test Stop',
                    data: [30, 28, 25, 20, 15, 10, 8, 5, 3, 1, 0],
                    borderColor: '#FF0000',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    borderWidth: 2,
                    pointRadius: 3
                }];
            }

            try {
                const stopCtx = document.getElementById('stopChart')?.getContext('2d');
                if (!stopCtx) throw new Error('Stop Chart canvas not found');
                document.getElementById('stopChart').width = 600;
                document.getElementById('stopChart').height = 400;
                stopChartInstance = new Chart(stopCtx, {
                    type: 'line',
                    data: {
                        labels: distanceLabels,
                        datasets: stopDatasets
                    },
                    options: {
                        responsive: false,
                        scales: {
                            x: {
                                title: { display: true, text: 'Distance Before Stop (m)' },
                                grid: { display: true, color: '#F5F5F5' },
                                ticks: { stepSize: 100 }
                            },
                            y: {
                                title: { display: true, text: 'Speed (kmph)' },
                                grid: { display: true, color: '#E6E6E6' },
                                beginAtZero: true,
                                ticks: { stepSize: 10 }
                            }
                        },
                        plugins: {
                            legend: { display: true, position: 'top' },
                            title: { display: true, text: 'Speed vs. Distance Before Stop' }
                        }
                    }
                });

                stopChartImage = await new Promise((resolve) => {
                    stopChartInstance.options.animation = {
                        onComplete: () => {
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = 400;
                            tempCanvas.height = 600;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.translate(400, 0);
                            tempCtx.rotate(Math.PI / 2);
                            const img = new Image();
                            img.src = document.getElementById('stopChart').toDataURL('image/png');
                            img.onload = () => {
                                tempCtx.drawImage(img, 0, 0, 600, 400);
                                const dataUrl = tempCanvas.toDataURL('image/png', 1.0);
                                console.log('Stop Chart Image generated (rotated 90°, 400x600):', dataUrl.substring(0, 50) + '...');
                                resolve(dataUrl);
                            };
                        }
                    };
                    stopChartInstance.update();
                });
            } catch (error) {
                console.error('Error generating Speed vs Distance chart:', error);
            }

            const stationStops = normalizedStations.map((station, stationIndex) => {
                const stopRangeStart = station.distance - 400;
                const stopRangeEnd = station.distance + 400;

                let stationStop = stops.find(stop => {
                    const stopDistance = stop.kilometer;
                    return stopDistance >= stopRangeStart && stopDistance <= stopRangeEnd;
                });

                let arrivalTime = 'N/A';
                let departureTime = 'N/A';

                if (stationStop) {
                    arrivalTime = stationStop.timeString;
                    departureTime = stationStop.startTiming;
                } else if (stationIndex !== normalizedStations.length - 1) {
                    let closestPoint = null;
                    let minDistanceDiff = Infinity;
                    for (const row of normalizedData) {
                        const distDiff = Math.abs(row.Distance - station.distance);
                        if (distDiff <= 1000 && distDiff < minDistanceDiff && row.Time >= fromDateTime && row.Time <= toDateTime) {
                            minDistanceDiff = distDiff;
                            closestPoint = row;
                        }
                    }
                    if (closestPoint) {
                        departureTime = closestPoint.Time.toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        });
                    }
                }

                if (stationIndex === 0 && station.name === fromSection) {
                    if (filteredData.length > 0) {
                        departureTime = filteredData[0].Time.toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        });
                    }
                    arrivalTime = 'N/A';
                }

                if (stationIndex === normalizedStations.length - 1 && station.name === toSection) {
                    if (stationStop) {
                        arrivalTime = stationStop.timeString;
                    } else {
                        let lastValidPoint = null;
                        let minTimeDiff = Infinity;
                        for (const row of normalizedData) {
                            const timeDiff = Math.abs(toDateTime - row.Time);
                            const distDiff = Math.abs(row.Distance - station.distance);
                            if (distDiff <= 2000 && row.Time <= toDateTime && timeDiff < minTimeDiff) {
                                minTimeDiff = timeDiff;
                                lastValidPoint = row;
                            }
                        }
                        if (lastValidPoint) {
                            arrivalTime = lastValidPoint.Time.toLocaleString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false
                            });
                        }
                    }
                    departureTime = 'N/A';
                }

                return { station: station.name, arrival: arrivalTime, departure: departureTime };
            });

            console.log('Station Stops:', stationStops);

            const reportData = {
                trainDetails: [
                    { label: 'Loco Number', value: locoNumber || 'N/A' },
                    { label: 'Train Number', value: trainNumber || 'N/A' },
                    { label: 'Type of Rake', value: rakeType || 'N/A' },
                    { label: 'Max Permissible Speed', value: maxPermissibleSpeed ? `${maxPermissibleSpeed} kmph` : 'N/A' },
                    { label: 'Section', value: section || 'N/A' },
                    { label: 'Route', value: routeSection || 'N/A' },
                    { label: 'SPM Type', value: spmType || 'N/A' },
                    { label: 'Analysis Time', value: `From ${fromDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} to ${toDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}` }
                ],
                lpDetails: [
                    `LP ID: ${lpId || 'N/A'}`,
                    `LP Name: ${lpName || 'N/A'}`,
                    `Designation: ${lpDesg || 'N/A'}`,
                    `Group CLI: ${lpGroupCli || 'N/A'}`,
                    `CUG Number: ${lpCugNumber || 'N/A'}`
                ],
                alpDetails: [
                    `ALP ID: ${alpId || 'N/A'}`,
                    `ALP Name: ${alpName || 'N/A'}`,
                    `Designation: ${alpDesg || 'N/A'}`,
                    `Group CLI: ${alpGroupCli || 'N/A'}`,
                    `CUG Number: ${alpCugNumber || 'N/A'}`
                ],
                stopCount: stops.length,
                bftDetails,
                bptDetails,
                crewCallData,
                stops: stops.map((stop, index) => ({
                    group: index + 1,
                    stopLocation: stop.stopLocation,
                    timeString: stop.timeString,
                    startTiming: stop.startTiming,
                    kilometer: stop.kilometer,
                    speedsBefore: stop.speedsBefore,
                    brakingTechnique: stop.brakingTechnique
                })),
                stationStops,
                overSpeedDetails,
                wheelSlipDetails,
                wheelSkidDetails,
                speedChartImage,
                stopChartImage,
                speedChartConfig: {
                    labels: labels.slice(0, maxPoints),
                    speeds: speeds.slice(0, maxPoints)
                },
                stopChartConfig: {
                    labels: distanceLabels,
                    datasets: stopDatasets
                }
            };

            console.log('Final reportData for Charts:', {
                speedChartConfig: { labels: reportData.speedChartConfig.labels.length, speeds: reportData.speedChartConfig.speeds.length },
                stopChartConfig: { labels: reportData.stopChartConfig.labels.length, datasets: reportData.stopChartConfig.datasets.length },
                speedChartImage: reportData.speedChartImage ? 'Present' : 'Missing',
                stopChartImage: reportData.stopChartImage ? 'Present' : 'Missing'
            });

            try {
                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                console.log('reportData saved to localStorage');
            } catch (error) {
                console.error('Error saving reportData to localStorage:', error);
                alert('Failed to save report data. Please check console logs.');
                return;
            }

            setTimeout(() => {
                window.location.href = 'report.html';
            }, 1000);

            if (reportData.stopCount === 0) {
                alert('No stops found. Please check the report and console logs.');
            }
        } catch (error) {
            console.error('Error processing SPM file:', error);
            alert('Failed to process SPM file. Please check console logs.');
        }
    };

    reader.onerror = () => {
        console.error('Error reading file');
        alert('Failed to read SPM file.');
    };

    reader.readAsArrayBuffer(spmFile);
});