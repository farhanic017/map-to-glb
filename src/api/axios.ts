import axios from "axios";
import { getCookie } from "../utils/cookie";

const instanceFleet = axios.create({
  baseURL: `https://api.fleet.cartesiancs.com/api/`,
  timeout: 7000,
  headers: { "x-access-token": getCookie("token") },
});

export default instanceFleet;
