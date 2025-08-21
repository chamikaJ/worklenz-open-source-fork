import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";

import db from "../config/db";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import HandleExceptions from "../decorators/handle-exceptions";
import { getTeamMemberCount } from "../shared/paddle-utils";
import { generatePayLinkRequest, updateUsers } from "../shared/paddle-requests";

import CryptoJS from "crypto-js";
import moment from "moment";
import axios from "axios";

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { log_error } from "../shared/utils";
import { sendEmail } from "../shared/email";

export default class BillingController extends WorklenzControllerBase {
  public static async getInitialCharge(count: number) {
    if (!count) throw new Error("No selected plan detected.");

    const baseRate = 4990;
    const firstTier = 15;
    const secondTierEnd = 200;

    if (count <= firstTier) {
      return baseRate;
    } else if (count <= secondTierEnd) {
      return baseRate + (count - firstTier) * 300;
    }
    return baseRate + (secondTierEnd - firstTier) * 300 + (count - secondTierEnd) * 200;

  }

  public static async getBillingMonth() {
    const startDate = moment().format("YYYYMMDD");
    const endDate = moment().add(1, "month").subtract(1, "day").format("YYYYMMDD");

    return `${startDate} - ${endDate}`;
  }

  public static async chargeInitialPayment(signature: string, data: any) {
    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: process.env.DP_URL,
      headers: {
        "Content-Type": "application/json",
        "Signature": signature,
        "x-api-key": process.env.DP_API_KEY
      },
      data
    };

    axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));

      })
      .catch((error) => {
        console.log(error);
      });
  }

  public static async saveLocalTransaction(signature: string, data: any) {
    try {
      const q = `INSERT INTO transactions (status, transaction_id, transaction_status, description, date_time, reference, amount, card_number)
VALUES ($1, $2, $3);`;
      const result = await db.query(q, []);
    } catch (error) {
      log_error(error);
    }
  }

  @HandleExceptions()
  public static async upgradeToPaidPlan(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { plan, seatCount } = req.query;

    const teamMemberData = await getTeamMemberCount(req.user?.owner_id ?? "");
    teamMemberData.user_count = seatCount as string;
    const axiosResponse = await generatePayLinkRequest(teamMemberData, plan as string, req.user?.owner_id, req.user?.id);

    return res.status(200).send(new ServerResponse(true, axiosResponse.body));
  }

  @HandleExceptions()
  public static async addMoreSeats(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { seatCount } = req.body;

    const q = `SELECT subscription_id
    FROM licensing_user_subscriptions lus
    WHERE user_id = $1;`;
    const result = await db.query(q, [req.user?.owner_id]);
    const [data] = result.rows;

    const response = await updateUsers(data.subscription_id, seatCount);

    if (!response.body.subscription_id) {
      return res.status(200).send(new ServerResponse(false, null, response.message || "Please check your subscription."));
    }
    return res.status(200).send(new ServerResponse(true, null, "Your purchase has been successfully completed!").withTitle("Done"));
  }

  @HandleExceptions()
  public static async getDirectPayObject(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { seatCount } = req.query;
    if (!seatCount) return res.status(200).send(new ServerResponse(false, null));
    const email = req.user?.email;
    const name = req.user?.name;
    const amount = await this.getInitialCharge(parseInt(seatCount as string));
    const uniqueTimestamp = moment().format("YYYYMMDDHHmmss");
    const billingMonth = await this.getBillingMonth();

    const { DP_MERCHANT_ID, DP_SECRET_KEY, DP_STAGE } = process.env;

    const payload = {
      merchant_id: DP_MERCHANT_ID,
      amount: 10,
      type: "RECURRING",
      order_id: `WORKLENZ_${email}_${uniqueTimestamp}`,
      currency: "LKR",
      return_url: null,
      response_url: null,
      first_name: name,
      last_name: null,
      phone: null,
      email,
      description: `${name} (${email})`,
      page_type: "IN_APP",
      logo: "https://app.worklenz.com/assets/icons/icon-96x96.png",
      start_date: moment().format("YYYY-MM-DD"),
      do_initial_payment: 1,
      interval: 1,
    };

    const encodePayload = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(payload)));
    const signature = CryptoJS.HmacSHA256(encodePayload, DP_SECRET_KEY as string);

    return res.status(200).send(new ServerResponse(true, { signature: signature.toString(CryptoJS.enc.Hex), dataString: encodePayload, stage: DP_STAGE }));
  }

  @HandleExceptions()
  public static async saveTransactionData(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { status, card, transaction, seatCount } = req.body;
    const { DP_MERCHANT_ID, DP_STAGE } = process.env;

    const email = req.user?.email;

    const amount = await this.getInitialCharge(parseInt(seatCount as string));
    const uniqueTimestamp = moment().format("YYYYMMDDHHmmss");
    const billingMonth = await this.getBillingMonth();

    const values = [
      status,
      card?.id,
      card?.number,
      card?.brand,
      card?.type,
      card?.issuer,
      card?.expiry?.year,
      card?.expiry?.month,
      card?.walletId,
      transaction?.id,
      transaction?.status,
      transaction?.amount || 0,
      transaction?.currency || null,
      transaction?.channel || null,
      transaction?.dateTime || null,
      transaction?.message || null,
      transaction?.description || null,
      req.user?.id,
      req.user?.owner_id,
    ];

    const q = `INSERT INTO licensing_lkr_payments (
      status, card_id, card_number, card_brand, card_type, card_issuer,
      card_expiry_year, card_expiry_month, wallet_id,
      transaction_id, transaction_status, transaction_amount, 
      transaction_currency, transaction_channel, transaction_datetime,
      transaction_message, transaction_description, user_id, owner_id
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    );`;
    await db.query(q, values);

    if (transaction.status === "SUCCESS") {
      const payload = {
        "merchantId": DP_MERCHANT_ID,
        "reference": `WORKLENZ_${email}_${uniqueTimestamp}`,
        "type": "CARD_PAY",
        "cardId": card.id,
        "refCode": req.user?.id,
        amount,
        "currency": "LKR"
      };
      const dataString = Object.values(payload).join("");
      const { DP_STAGE } = process.env;

      const pemFile = DP_STAGE === "PROD" ? "src/keys/PRIVATE_KEY_PROD.pem" : `src/keys/PRIVATE_KEY_DEV.pem`;

      const privateKeyTest = fs.readFileSync(path.resolve(pemFile), "utf8");
      const sign = crypto.createSign("SHA256");
      sign.update(dataString);
      sign.end();

      const signature = sign.sign(privateKeyTest);
      const byteArray = new Uint8Array(signature);
      let byteString = "";
      for (let i = 0; i < byteArray.byteLength; i++) {
        byteString += String.fromCharCode(byteArray[i]);
      }
      const base64Signature = btoa(byteString);

      this.chargeInitialPayment(base64Signature, payload);
    }

    return res.status(200).send(new ServerResponse(true, null, "Your purchase has been successfully completed!").withTitle("Done"));
  }

  @HandleExceptions()
  public static async getCardList(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const payload = {
      "merchantId": "RT02300",
      "reference": "1234",
      "type": "LIST_CARD"
    };

    const { DP_STAGE } = process.env;

    const dataString = `RT023001234LIST_CARD`;
    const pemFile = DP_STAGE === "PROD" ? "src/keys/PRIVATE_KEY_PROD.pem" : `src/keys/PRIVATE_KEY_DEV.pem`;

    const privateKeyTest = fs.readFileSync(path.resolve(pemFile), "utf8");
    const sign = crypto.createSign("SHA256");
    sign.update(dataString);
    sign.end();

    const signature = sign.sign(privateKeyTest);
    const byteArray = new Uint8Array(signature);
    let byteString = "";
    for (let i = 0; i < byteArray.byteLength; i++) {
      byteString += String.fromCharCode(byteArray[i]);
    }
    const base64Signature = btoa(byteString);
    // const signature = CryptoJS.HmacSHA256(dataString, DP_SECRET_KEY as string).toString(CryptoJS.enc.Hex);

    return res.status(200).send(new ServerResponse(true, { signature: base64Signature, dataString }));
  }

  @HandleExceptions()
  public static async contactUs(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { contactNo } = req.query;

    if (!contactNo) {
      return res.status(200).send(new ServerResponse(false, null, "Contact number is required!"));
    }

    const html = `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Worklenz Local Billing - Contact Information</title>
      </head>
      <body>
          <div>
              <h1 style="text-align: center; margin-bottom: 20px;">Worklenz Local Billing - Contact Information</h1>
              <p><strong>Name:</strong> ${req.user?.name}</p>
              <p><strong>Contact No:</strong> ${contactNo as string}</p>
              <p><strong>Email:</strong> ${req.user?.email}</p>
          </div>
      </body>
      </html>`;
    const to = [process.env.CONTACT_US_EMAIL || "chamika@ceydigital.com"];

    sendEmail({
      to,
      subject: "Worklenz - Local billing contact.",
      html
    });
    return res.status(200).send(new ServerResponse(true, null, "Your contact information has been sent successfully."));
  }

  @HandleExceptions()
  public static async getPricingPlans(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const q = `
      SELECT id, name, key, billing_type, billing_period, default_currency, 
             initial_price, recurring_price, trial_days, paddle_id, 
             active, is_startup_plan
      FROM licensing_pricing_plans 
      WHERE active = true and is_startup_plan = false
      ORDER BY sort_order ASC;
    `;
    const result = await db.query(q);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

}