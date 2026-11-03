import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import { ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";
import "dotenv/config";

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






const AUTH_BASE_URL = process.env.BETTER_AUTH_URL;

if (!AUTH_BASE_URL) {
  throw new Error("BETTER_AUTH_URL is missing from .env");
}

const JWKS = createRemoteJWKSet(
  new URL(`${AUTH_BASE_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Authorization token missing",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_BASE_URL,
      audience: AUTH_BASE_URL,
    });

    if (!payload.email) {
      return res.status(401).send({
        message: "User email not found in token",
      });
    }

    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT verification failed:", error);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};

export { verifyToken };


app.post("/dashboard/create-event", verifyToken, async (req, res) => {
  try {
    const data = {
      ...req.body,
      email: req.user.email,
    };

    const result = await eventsCollection.insertOne(data);

    res.status(201).send({
      message: "Event created successfully",
      result,
    });
  } catch (error) {
    console.error("Create event error:", error);

    res.status(500).send({
      message: "Failed to create event",
    });
  }
});


app.get("/my-created-events/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;

    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).send({
        message: "Access denied",
      });
    }

    const result = await eventsCollection.find({ email }).toArray();

    res.status(200).send(result);
  } catch (error) {
    console.error("My created events error:", error);

    res.status(500).send({
      message: "Failed to fetch events",
    });
  }
});


app.patch("/dashboard/update-event/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const updatedData = { ...req.body };
    delete updatedData.email;

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        email: req.user.email,
      },
      {
        $set: updatedData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Event not found or access denied",
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



app.get("/upcoming-events", async (req, res) => {
  try {
    const result = await eventsCollection
      .find({ status: "upcoming" })
      .toArray();

    res.status(200).send(result);
  } catch (error) {
    console.error("Upcoming events error:", error);

    res.status(500).send({
      message: "Failed to fetch upcoming events",
    });
  }
});

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

    res.status(200).send({ result });
  } catch (error) {
    console.error("Get event error:", error);

    res.status(500).send({
      message: "Internal Server Error",
    });
  }
});



app.delete("/dashboard/delete-event/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
      email: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Event not found or access denied",
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



app.post("/join-event", verifyToken, async (req, res) => {
  try {
    const { eventId, userName } = req.body;
    const userEmail = req.user.email;

    if (!eventId) {
      return res.status(400).send({
        message: "Event ID is required",
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

    if (event.email?.toLowerCase() === userEmail.toLowerCase()) {
      return res.status(403).send({
        message: "You cannot join your own event",
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

    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      { $inc: { joined: 1 } }
    );

    return res.status(201).send({
      message: "Successfully joined the event",
      result,
    });
  } catch (error) {
    console.error("Join event error:", error);

    return res.status(500).send({
      message: "Failed to join the event",
    });
  }
});



app.delete("/leave-event", verifyToken, async (req, res) => {
  try {
    const { eventId } = req.body;
    const userEmail = req.user.email;

    if (!eventId) {
      return res.status(400).send({
        message: "Event ID is required",
      });
    }

    if (!ObjectId.isValid(eventId)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const result = await joinedEventsCollection.deleteOne({
      eventId,
      userEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "You have not joined this event",
      });
    }

    await eventsCollection.updateOne(
      { _id: new ObjectId(eventId) },
      { $inc: { joined: -1 } }
    );

    return res.status(200).send({
      message: "Successfully left the event",
    });
  } catch (error) {
    console.error("Leave event error:", error);

    return res.status(500).send({
      message: "Failed to leave the event",
    });
  }
});



app.get("/my-joined-events/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;

    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).send({
        message: "Access denied",
      });
    }

    const joinedRecords = await joinedEventsCollection
      .find({ userEmail: email })
      .toArray();

    const eventIds = joinedRecords.map(
      (item) => new ObjectId(item.eventId)
    );

    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    const joinedEvents = events.map((event) => {
      const joinedRecord = joinedRecords.find(
        (item) => item.eventId === event._id.toString()
      );

      return {
        ...event,
        joinedAt: joinedRecord?.joinedAt || null,
      };
    });

    res.status(200).send(joinedEvents);
  } catch (error) {
    console.error("My joined events error:", error);

    res.status(500).send({
      message: "Failed to fetch joined events",
    });
  }
});







app.get("/recent-events", async (req, res) => {
  try {
    const result = await eventsCollection
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();

    res.status(200).send(result);
  } catch (error) {
    console.error("Recent events error:", error);

    res.status(500).send({
      message: "Failed to fetch recent events",
    });
  }
});






app.get("/events", async (req, res) => {
  try {
    const result = await eventsCollection.find().toArray();

    res.status(200).send(result);
  } catch (error) {
    console.error("Get events error:", error);

    res.status(500).send({
      message: "Failed to fetch events",
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

export default app