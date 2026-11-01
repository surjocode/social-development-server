import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import { ObjectId } from "mongodb";

const app = express()
const PORT = 8000
app.use(cors())
app.use(express.json())




const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}


const mongodbClient = await connectToMongoDB()

const db = mongodbClient.db('helping-hands')
const eventsCollection = db.collection('events')

app.post('/dashboard/create-event', async (req, res) => {
  const data = req.body
 const result = await eventsCollection.insertOne(data)
 console.log(result)
  res.send({result})
})



app.get('/upcoming-events', async (req, res) => {
  const result = await eventsCollection.find({ status: "upcoming" }).toArray()
  res.send(result)
})
app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const query = ObjectId.isValid(id)
      ? { _id: new ObjectId(id) }
      : { _id: id };

    const result = await eventsCollection.findOne(query);

    if (!result) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    res.send({ result });
  } catch (error) {
    res.status(500).send({
      message: "Internal Server Error",
    });
  }
});



// http://localhost:8000

app.get('/', (req, res) => {
    res.send({message: 'Server is running fine!'})
})

app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
})