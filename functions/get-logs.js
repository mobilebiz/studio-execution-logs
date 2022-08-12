const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.tz.setDefault('Asia/Tokyo'); // Change your location

let client = null;

/**
 * Get executions
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {String} flowSid
 * @returns executions
 */
const getExecutions = async (startDate, endDate, flowSid) => {
  console.log(`🐞 getExecutions ${startDate} ${endDate}`);
  try {
    return await client.studio.v2.flows(flowSid).executions.list({
      dateCreatedFrom: startDate,
      dateCreatedTo: endDate,
    });
  } catch (err) {
    console.error(`👺 ERROR getExecutions: ${err.message ? err.message : err}`);
    throw err;
  }
};

/**
 * Get execution steps
 * @param {String} executionSid
 * @param {String} flowSid
 * @returns steps
 */
const getSteps = async (executionSid, flowSid) => {
  console.log(`🐞 getSteps ${executionSid}`);
  try {
    return await client.studio.v2
      .flows(flowSid)
      .executions(executionSid)
      .steps.list();
  } catch (err) {
    console.error(`👺 ERROR getSteps: ${err.message ? err.message : err}`);
    throw err;
  }
};

exports.handler = async function (context, event, callback) {
  try {
    // Get parameters
    const now = dayjs().tz().startOf('day').startOf('month'); // Get first day of month(JST)
    const { m, y, d } = event;
    const month = m ? m - 1 : now.get('month');
    const year = y || now.get('year');
    const date = d || now.get('date');

    // Response
    const response = new Twilio.Response();

    // Twilio Client
    const { ACCOUNT_SID, API_KEY, API_SECRET } = context;
    client = require('twilio')(API_KEY, API_SECRET, {
      accountSid: ACCOUNT_SID,
    });

    // Set date
    const startDate = now.year(year).month(month).date(date);
    const endDate = startDate.endOf('day');

    const results = [];

    // Get executions
    const executions = await getExecutions(
      startDate.utc().format(),
      endDate.utc().format(),
      context.FLOW_SID,
    );

    // Sort by execution date
    executions.sort((a, b) => a.dateCreated - b.dateCreated);

    for (let execution of executions) {
      const steps = await getSteps(execution.sid, context.FLOW_SID);
      const step = [];
      for (let s of steps) {
        const { name, transitionedFrom, transitionedTo, dateCreated } = s;
        step.push({
          dateCreated,
          name,
          transitionedFrom,
          transitionedTo,
        });
      }

      // Sort by execution step
      step.sort((a, b) => a.dateCreated - b.dateCreated);

      results.push({
        sid: execution.sid,
        executionDate: dayjs(execution.dateCreated).tz().format(),
        steps: step.map((s) => {
          return {
            ...s,
            dateCreated: dayjs(s.dateCreated).tz().format(),
          };
        }),
      });
    }

    console.log(`🐞 ${context.DOMAIN_NAME}`);

    if (context.DOMAIN_NAME.match(/localhost/)) {
      // Execute via localhost
      response.appendHeader('Content-type', 'application/json');
      response.appendHeader('Cache-Control', 'no-cache');
      response.appendHeader(
        'Content-Disposition',
        `attachment; filename="execution-${dayjs()
          .tz()
          .format('YYYYMMDD_HHmmss')}.json"`,
      );
      response.setBody({ results });
      callback(null, response);
    } else {
      // Execute via Twilio Server
      callback(null, JSON.stringify({ results }, null, '\t'));
    }
  } catch (err) {
    callback(err);
  }
};
