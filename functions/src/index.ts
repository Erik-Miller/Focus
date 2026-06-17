import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

export {
  startSession,
  stopSession,
  resumeSession,
  deleteSession,
} from "./callables/startSession.js";
export { processObservations } from "./callables/processObservations.js";
export { chatWithAgent, cancelChatRun } from "./callables/chatWithAgent.js";
export { generateReport } from "./callables/generateReport.js";
export { seedDemoSession } from "./callables/seedDemoSession.js";
export {
  saveWorkflowForLater,
  deleteSavedWorkflow,
  recordSavedWorkflowLaunch,
} from "./callables/savedWorkflows.js";
