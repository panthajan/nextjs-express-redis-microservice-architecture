"use strict";
import cors from "cors"; //CORS is a node.js package for providing a Connect/Express middleware that can be used to enable CORS with various options.
import dotenv from "dotenv"; //Dotenv is a zero-dependency module that loads environment variables from a .env file into process.env. Storing configuration in the environment separate from code is based on The Twelve-Factor App methodology.
import express from "express"; //Fast, unopinionated, minimalist web framework for Node.js.
import mysql from "mysql2/promise"; //Small promises wrapper for mysql2, it's forked and compatible with mysql-promise.
import { createClient } from "redis"; //node-redis is a modern, high performance Redis client for Node.js.

dotenv.config();
// environment variables
const expressPort = process.env.PORT || 5001; // In many environments (e.g. Heroku), and as a convention, you can set the environment variable PORT to tell your web server what port to listen on. So process.env.PORT || 3000 means: whatever is in the environment variable PORT, or 3000 if there's nothing there.

// redis
const redisUsername = process.env.REDIS_USERNAME || "";
const redisPassword = process.env.REDIS_PASSWORD || "";
const redisHost = process.env.REDIS_HOST || "";
const redisPort = process.env.REDIS_PORT || "";
const redisChannel = process.env.REDIS_CHANNEL || "";

// mysql
const sqlHost = process.env.MYSQL_HOST || "";
const sqlUser = process.env.MYSQL_USERNAME || "";
const sqlPassword = process.env.MYSQL_PASSWORD || "";
const sqlDatabase = process.env.MYSQL_DATABASE || "";
const sqlTable = process.env.MYSQL_TABLE || "";

// configs
const redisUrl = `redis://${redisUsername}:${redisPassword}@${redisHost}:${redisPort}`;
const dbConfig = {
  host: sqlHost,
  user: sqlUser,
  password: sqlPassword,
  database: sqlDatabase,
};

const redisClient = createClient({ url: redisUrl });

const getData = async () => {
  const sqlQuery = `SELECT data FROM ${sqlTable}`;
  const sqlConnection = await mysql.createConnection(dbConfig);
  return sqlConnection.execute(sqlQuery);
};

const setRedisCache = async (jsonData) => {
  const value = JSON.stringify({ isCached: "yes", data: jsonData });
  await redisClient.connect();
  await redisClient.set("key", value);
  return redisClient.disconnect();
};

const getRedisCache = async () => {
  await redisClient.connect();
  const cachedData = await redisClient.get("key");
  await redisClient.disconnect();
  return cachedData;
};

const deleteRedisCache = async () => {
  await redisClient.connect();
  await redisClient.del("key");
  return redisClient.disconnect();
};

const publishToRedis = async (data) => {
  await redisClient.connect();
  const subscriberCount = await redisClient.publish(redisChannel, data);
  await redisClient.disconnect();
  return subscriberCount;
};

//express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// express endpoints
app.get("/", (_, res) => res.status(200).send("connected to server 1!"));
app.get("/data", async (_, res) => {
  try {
    const cachedData = await getRedisCache();
    if (cachedData) {
      const results = JSON.parse(cachedData);
      res.status(200).json({ message: "success", ...results });
      // ending the fn
      return;
    }

    const [data, _] = await getData();
    await setRedisCache(data);

    res.status(200).json({ message: "success", isCached: "no", data });
  } catch (error) {
    console.log({ error });
    res.status(500).json({ message: "failure", error });
  }
});

app.post("/create", async (req, res) => {
  const { data } = req.body;
  try {
    if (!data) throw new Error("missing data");
    const subscriberCount = await publishToRedis(data);
    console.log({ subscriberCount });
    const test = await deleteRedisCache();
    res.status(200).json({ message: "success" });
  } catch (error) {
    console.log({ error });
    res.status(500).json({ message: "failure", error });
  }
});

app.listen(expressPort, () => console.log(`served on port ${expressPort}`));
