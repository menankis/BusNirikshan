const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const envInCwd = path.join(process.cwd(), ".env");
const envInParent = path.join(__dirname, "../../.env");

if (fs.existsSync(envInCwd)) {
  require("dotenv").config({ path: envInCwd });
} else if (fs.existsSync(envInParent)) {
  require("dotenv").config({ path: envInParent });
} else {
  require("dotenv").config();
}

const User = require("../models/user");
const Driver = require("../models/driver");
const Stop = require("../models/stop");
const Route = require("../models/route");
const Bus = require("../models/bus");
const Shift = require("../models/shift");
const BusLocation = require("../models/buslocation");
const Notification = require("../models/notification");

const PASSWORD = "Demo@12345";
const RTC = "GSRTC";
const JAIPUR_RTC = "RSRTC";

const users = [
  { name: "Demo Admin", email: "admin@demo.busnirikshan.local", role: "admin" },
  { name: "Demo Passenger", email: "passenger@demo.busnirikshan.local", role: "user" },
  { name: "Demo Driver One", email: "driver@demo.busnirikshan.local", role: "driver" },
  { name: "Demo Driver Two", email: "driver2@demo.busnirikshan.local", role: "driver" },
  { name: "Jaipur Demo Driver", email: "jaipur.driver@demo.busnirikshan.local", role: "driver", rtc: JAIPUR_RTC },
  { name: "Standby Jaipur Driver", email: "standby.driver@demo.busnirikshan.local", role: "driver", rtc: JAIPUR_RTC },
];

const stops = [
  { name: "Kalupur Railway Station", city: "Ahmedabad", state: "Gujarat", coordinates: [72.6011, 23.0304] },
  { name: "Lal Darwaja", city: "Ahmedabad", state: "Gujarat", coordinates: [72.5817, 23.0266] },
  { name: "Paldi", city: "Ahmedabad", state: "Gujarat", coordinates: [72.5626, 23.0120] },
  { name: "ISRO", city: "Ahmedabad", state: "Gujarat", coordinates: [72.5153, 23.0375] },
  { name: "Sarkhej", city: "Ahmedabad", state: "Gujarat", coordinates: [72.5011, 22.9820] },
  { name: "Gita Mandir", city: "Ahmedabad", state: "Gujarat", coordinates: [72.5893, 23.0122] },
  { name: "Ajmeri Gate", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8214, 26.9165] },
  { name: "Sindhi Camp Bus Stand", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8009, 26.9221] },
  { name: "MI Road", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8076, 26.9167] },
  { name: "Badi Chaupar", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8279, 26.9239] },
  { name: "Hawa Mahal", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8267, 26.9239] },
  { name: "JLN Marg", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8069, 26.8851] },
  { name: "Rambagh Circle", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8083, 26.8986] },
  { name: "Malviya Nagar", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.8177, 26.8506] },
  { name: "Mansarovar Metro Station", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.7513, 26.8796] },
  { name: "Vaishali Nagar", city: "Jaipur", state: "Rajasthan", rtc: [JAIPUR_RTC], coordinates: [75.7465, 26.9124] },
];

const routeDefs = [
  {
    name: "Demo Route A - Kalupur to Sarkhej",
    stopNames: ["Kalupur Railway Station", "Lal Darwaja", "Paldi", "Sarkhej"],
    totalDistanceKm: 13.8,
    estimatedDurationMin: 42,
  },
  {
    name: "Demo Route B - Gita Mandir to ISRO",
    stopNames: ["Gita Mandir", "Paldi", "ISRO"],
    totalDistanceKm: 10.6,
    estimatedDurationMin: 35,
  },
  {
    name: "Jaipur Route J1 - Sindhi Camp to Hawa Mahal",
    rtc: JAIPUR_RTC,
    stopNames: ["Sindhi Camp Bus Stand", "MI Road", "Ajmeri Gate", "Badi Chaupar", "Hawa Mahal"],
    totalDistanceKm: 7.4,
    estimatedDurationMin: 28,
  },
  {
    name: "Jaipur Route J2 - Mansarovar to Malviya Nagar",
    rtc: JAIPUR_RTC,
    stopNames: ["Mansarovar Metro Station", "Vaishali Nagar", "Rambagh Circle", "JLN Marg", "Malviya Nagar"],
    totalDistanceKm: 17.2,
    estimatedDurationMin: 52,
  },
];

function routePoint(start, end, index, total) {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  return {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lng: start.lng + (end.lng - start.lng) * ratio,
  };
}

async function upsertUser({ name, email, role, rtc = RTC }, passwordHash) {
  return User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        email,
        role,
        rtc,
        isActive: true,
      },
      $setOnInsert: { passwordHash },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );
}

async function upsertStop(stop) {
  return Stop.findOneAndUpdate(
    { name: stop.name, city: stop.city },
    {
      $set: {
        name: stop.name,
        city: stop.city,
        state: stop.state,
        rtc: stop.rtc || [RTC],
        location: { type: "Point", coordinates: stop.coordinates },
        isActive: true,
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Add it to .env or export it before running the seed.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const userDocs = {};
  for (const user of users) {
    userDocs[user.email] = await upsertUser(user, passwordHash);
  }

  const stopDocs = {};
  for (const stop of stops) {
    stopDocs[stop.name] = await upsertStop(stop);
  }

  const routeDocs = {};
  for (const route of routeDefs) {
    const stopIds = route.stopNames.map(name => stopDocs[name]._id);
    routeDocs[route.name] = await Route.findOneAndUpdate(
      { rtc: route.rtc || RTC, name: route.name },
      {
        $set: {
          name: route.name,
          rtc: route.rtc || RTC,
          stopIds,
          totalDistanceKm: route.totalDistanceKm,
          estimatedDurationMin: route.estimatedDurationMin,
          isActive: true,
        },
      },
      { returnDocument: "after", upsert: true, runValidators: true }
    );
  }

  const buses = [
    {
      registrationNumber: "GJ01-DEMO-1001",
      route: routeDocs["Demo Route A - Kalupur to Sarkhej"],
      capacity: 42,
      isActive: true,
      lat: 23.0218,
      lng: 72.5692,
      speed_kmh: 28,
      heading_deg: 245,
    },
    {
      registrationNumber: "GJ01-DEMO-1002",
      route: routeDocs["Demo Route B - Gita Mandir to ISRO"],
      capacity: 36,
      isActive: true,
      lat: 23.0241,
      lng: 72.5520,
      speed_kmh: 22,
      heading_deg: 300,
    },
    {
      registrationNumber: "GJ01-DEMO-1003",
      route: routeDocs["Demo Route A - Kalupur to Sarkhej"],
      capacity: 50,
      isActive: false,
      lat: 23.0304,
      lng: 72.6011,
      speed_kmh: 0,
      heading_deg: 180,
    },
    {
      registrationNumber: "RJ14-DEMO-2001",
      route: routeDocs["Jaipur Route J1 - Sindhi Camp to Hawa Mahal"],
      capacity: 44,
      isActive: true,
      lat: 26.9182,
      lng: 75.8178,
      speed_kmh: 18,
      heading_deg: 92,
    },
    {
      registrationNumber: "RJ14-DEMO-2002",
      route: routeDocs["Jaipur Route J2 - Mansarovar to Malviya Nagar"],
      capacity: 48,
      isActive: false,
      lat: 26.8796,
      lng: 75.7513,
      speed_kmh: 0,
      heading_deg: 70,
    },
  ];

  const busDocs = {};
  for (const bus of buses) {
    busDocs[bus.registrationNumber] = await Bus.findOneAndUpdate(
      { registrationNumber: bus.registrationNumber },
      {
        $set: {
          routeId: bus.route._id,
          rtc: bus.route.rtc || RTC,
          routeName: bus.route.name,
          registrationNumber: bus.registrationNumber,
          capacity: bus.capacity,
          isActive: bus.isActive,
          lastKnownLocation: {
            type: "Point",
            coordinates: [bus.lng, bus.lat],
            speed_kmh: bus.speed_kmh,
            heading_deg: bus.heading_deg,
            recordedAt: new Date(),
          },
        },
      },
      { returnDocument: "after", upsert: true, runValidators: true }
    );
  }

  const driverOne = await Driver.findOneAndUpdate(
    { userId: userDocs["driver@demo.busnirikshan.local"]._id },
    {
      $set: {
        userId: userDocs["driver@demo.busnirikshan.local"]._id,
        rtc: RTC,
        licenseNumber: "GJ01-20240001",
        assignedBusId: busDocs["GJ01-DEMO-1001"]._id,
        isOnShift: true,
        shiftStartedAt: new Date(Date.now() - 45 * 60 * 1000),
      },
      $setOnInsert: { totalShifts: 1 },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  const driverTwo = await Driver.findOneAndUpdate(
    { userId: userDocs["driver2@demo.busnirikshan.local"]._id },
    {
      $set: {
        userId: userDocs["driver2@demo.busnirikshan.local"]._id,
        rtc: RTC,
        licenseNumber: "GJ01-20240002",
        assignedBusId: busDocs["GJ01-DEMO-1002"]._id,
        isOnShift: true,
        shiftStartedAt: new Date(Date.now() - 25 * 60 * 1000),
      },
      $setOnInsert: { totalShifts: 1 },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  const jaipurDriver = await Driver.findOneAndUpdate(
    { userId: userDocs["jaipur.driver@demo.busnirikshan.local"]._id },
    {
      $set: {
        userId: userDocs["jaipur.driver@demo.busnirikshan.local"]._id,
        rtc: JAIPUR_RTC,
        licenseNumber: "RJ14-20240001",
        assignedBusId: busDocs["RJ14-DEMO-2001"]._id,
        isOnShift: true,
        shiftStartedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
      $setOnInsert: { totalShifts: 1 },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  await Driver.findOneAndUpdate(
    { userId: userDocs["standby.driver@demo.busnirikshan.local"]._id },
    {
      $set: {
        userId: userDocs["standby.driver@demo.busnirikshan.local"]._id,
        rtc: JAIPUR_RTC,
        licenseNumber: "RJ14-20240002",
        assignedBusId: null,
        isOnShift: false,
        shiftStartedAt: null,
      },
      $setOnInsert: { totalShifts: 0 },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  await Shift.deleteMany({ driverId: { $in: [driverOne._id, driverTwo._id, jaipurDriver._id] }, endedAt: null });
  await Shift.insertMany([
    {
      driverId: driverOne._id,
      busId: busDocs["GJ01-DEMO-1001"]._id,
      startedAt: driverOne.shiftStartedAt,
      endedAt: null,
      totalPointsRecorded: 8,
      startLocation: { lat: 23.0304, lng: 72.6011 },
    },
    {
      driverId: driverTwo._id,
      busId: busDocs["GJ01-DEMO-1002"]._id,
      startedAt: driverTwo.shiftStartedAt,
      endedAt: null,
      totalPointsRecorded: 6,
      startLocation: { lat: 23.0122, lng: 72.5893 },
    },
    {
      driverId: jaipurDriver._id,
      busId: busDocs["RJ14-DEMO-2001"]._id,
      startedAt: jaipurDriver.shiftStartedAt,
      endedAt: null,
      totalPointsRecorded: 7,
      startLocation: { lat: 26.9221, lng: 75.8009 },
    },
  ]);

  const seededBusIds = [
    busDocs["GJ01-DEMO-1001"]._id,
    busDocs["GJ01-DEMO-1002"]._id,
    busDocs["RJ14-DEMO-2001"]._id,
  ];
  await BusLocation.deleteMany({ busId: { $in: seededBusIds } });

  const now = Date.now();
  const trailA = Array.from({ length: 8 }, (_, index) => {
    const point = routePoint({ lat: 23.0304, lng: 72.6011 }, { lat: 23.0218, lng: 72.5692 }, index, 8);
    return {
      busId: busDocs["GJ01-DEMO-1001"]._id,
      driverId: driverOne._id,
      timestamp: new Date(now - (7 - index) * 5 * 60 * 1000),
      coordinates: point,
      speed_kmh: 24 + index,
      heading_deg: 245,
    };
  });
  const trailB = Array.from({ length: 6 }, (_, index) => {
    const point = routePoint({ lat: 23.0122, lng: 72.5893 }, { lat: 23.0241, lng: 72.5520 }, index, 6);
    return {
      busId: busDocs["GJ01-DEMO-1002"]._id,
      driverId: driverTwo._id,
      timestamp: new Date(now - (5 - index) * 4 * 60 * 1000),
      coordinates: point,
      speed_kmh: 20 + index,
      heading_deg: 300,
    };
  });
  const trailJaipur = Array.from({ length: 7 }, (_, index) => {
    const point = routePoint({ lat: 26.9221, lng: 75.8009 }, { lat: 26.9239, lng: 75.8267 }, index, 7);
    return {
      busId: busDocs["RJ14-DEMO-2001"]._id,
      driverId: jaipurDriver._id,
      timestamp: new Date(now - (6 - index) * 5 * 60 * 1000),
      coordinates: point,
      speed_kmh: 16 + index,
      heading_deg: 92,
    };
  });
  await BusLocation.insertMany([...trailA, ...trailB, ...trailJaipur]);

  await Notification.findOneAndUpdate(
    {
      userId: userDocs["passenger@demo.busnirikshan.local"]._id,
      stopId: stopDocs["Paldi"]._id,
      routeId: routeDocs["Demo Route A - Kalupur to Sarkhej"]._id,
    },
    {
      $set: {
        thresholdMinutes: 10,
        isActive: true,
        lastNotifiedAt: null,
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  await Notification.findOneAndUpdate(
    {
      userId: userDocs["passenger@demo.busnirikshan.local"]._id,
      stopId: stopDocs["Hawa Mahal"]._id,
      routeId: routeDocs["Jaipur Route J1 - Sindhi Camp to Hawa Mahal"]._id,
    },
    {
      $set: {
        thresholdMinutes: 12,
        isActive: true,
        lastNotifiedAt: null,
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  console.log("Demo seed complete.");
  console.log("Password for all demo users:", PASSWORD);
  console.table([
    { role: "admin", email: "admin@demo.busnirikshan.local" },
    { role: "passenger", email: "passenger@demo.busnirikshan.local" },
    { role: "driver", email: "driver@demo.busnirikshan.local" },
    { role: "driver", email: "driver2@demo.busnirikshan.local" },
    { role: "driver", email: "jaipur.driver@demo.busnirikshan.local" },
    { role: "driver", email: "standby.driver@demo.busnirikshan.local" },
  ]);
}

main()
  .catch((err) => {
    console.error("Demo seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
