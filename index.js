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
const joinedEventsCollection = db.collection('joinedEvents')


app.post("/dashboard/create-event", async (req, res) => {
  try {
    const data = req.body;
    const result = await eventsCollection.insertOne(data);

    res.status(201).send({
      message: "Event created successfully",
      result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to create event",
    });
  }
});


app.get("/my-created-events/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const result = await eventsCollection.find({ email }).toArray();

    res.send(result);
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to fetch events",
    });
  }
});

app.patch("/dashboard/update-event/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    res.status(200).send({
      message: "Event updated successfully",
      result,
    });
  } catch (error) {
    console.error("Update event error:", error);

    res.status(500).send({
      message: "Failed to update event",
    });
  }
});


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


app.delete("/dashboard/delete-event/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    res.status(200).send({
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Delete event error:", error);

    res.status(500).send({
      message: "Failed to delete event",
    });
  }
});


app.post("/join-event", async (req, res) => {
  try {
    const { eventId, userEmail, userName } = req.body;

    if (!eventId || !userEmail) {
      return res.status(400).send({
        message: "Event ID and email are required",
      });
    }

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });

    if (!event) {
      return res.status(404).send({
        message: "Event not found",
      });
    }

    const alreadyJoined = await joinedEventsCollection.findOne({
      eventId,
      userEmail,
    });

    if (alreadyJoined) {
      return res.status(409).send({
        message: "You already joined this event",
      });
    }

    const result = await joinedEventsCollection.insertOne({
      eventId,
      userEmail,
      userName: userName || "",
      joinedAt: new Date(),
    });

    res.status(201).send({
      message: "Successfully joined the event",
      result,
    });
  } catch (error) {
    console.error("Join event error:", error);

    res.status(500).send({
      message: "Failed to join event",
    });
  }
});



app.get("/my-joined-events/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const joinedEvents = await joinedEventsCollection
      .find({ userEmail: email })
      .toArray();

    const eventIds = joinedEvents.map(
      (item) => new ObjectId(item.eventId)
    );

    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    console.error("My joined events error:", error);

    res.status(500).send({
      message: "Failed to fetch joined events",
    });
  }
});

// http://localhost:8000

app.get('/', (req, res) => {
  res.send({ message: 'Server is running fine!' })
})

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
})