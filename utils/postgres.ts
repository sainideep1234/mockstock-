// db.js
import postgres from 'postgres'
import { DATABASE_URL } from '../config.js'

const connectionString = DATABASE_URL
const sql = postgres(connectionString)

export default sql