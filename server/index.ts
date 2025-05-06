import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fishtankRouter from './fishtank';
import voicecoachRouter from './voicecoach';

dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

console.log('Mounting fishtank router at /api/fishtank');
app.use('/api/fishtank', fishtankRouter);

console.log('Mounting voice coach router at /api/voicecoach');
app.use('/api/voicecoach', voicecoachRouter);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
