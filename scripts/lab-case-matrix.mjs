const diets = [
  ["none", "", false],
  ["vegan", "vegan", true],
  ["vegetarian", "vegetarian", false],
  ["pescatarian", "pescatarian", false],
  ["dairy-free", "dairy-free", true],
  ["gluten-free", "gluten-free", false],
  ["pork-free", "pork-free", false],
  ["peanut-note", "allergy peanut", false]
];
const signals = ["high", "low-recovery", "low-sleep", "low-nutrition", "symptom"];
const cycles = [1, 2, 3, 7, 12];
const pains = ["clear", "knee", "red-flag", "pro-no-exercise", "pro-other"];

function painProfile(kind) {
  if (kind === "knee") return { currentPain: "yes", painAreas: ["knee"], redFlags: "no", professionalRestrictions: "no", professionalRestrictionScope: "", safetyDetails: "knee discomfort" };
  if (kind === "red-flag") return { currentPain: "no", painAreas: [], redFlags: "yes", professionalRestrictions: "no", professionalRestrictionScope: "", safetyDetails: "" };
  if (kind === "pro-no-exercise") return { currentPain: "no", painAreas: [], redFlags: "no", professionalRestrictions: "yes", professionalRestrictionScope: "no_exercise", safetyDetails: "" };
  if (kind === "pro-other") return { currentPain: "no", painAreas: [], redFlags: "no", professionalRestrictions: "yes", professionalRestrictionScope: "modify", safetyDetails: "" };
  return { currentPain: "no", painAreas: [], redFlags: "no", professionalRestrictions: "no", professionalRestrictionScope: "", safetyDetails: "" };
}
function expectedRoute(kind) {
  if (kind === "red-flag" || kind === "pro-no-exercise") return { status: "RESTRICTED", trainingRestricted: true };
  if (kind === "knee" || kind === "pro-other") return { status: "REVIEW_NOTIFY", trainingRestricted: false };
  return { status: "CLEAR", trainingRestricted: false };
}

export async function runLabCases(api) {
  const { check, safetyRouting, mealAllowedByPreferences, buildSignals, deterministicDelta, validateDelta, makeTrace, state, basePlan } = api;
  const cottage = { protein: "", grain: "", veggies: [], title: { pt: "Cottage cheese", en: "Cottage cheese", es: "Cottage cheese" }, ingredients: ["cottage cheese", "pineapple"] };
  const seen = new Set();
  const digests = new Set();
  let n = 0;
  for (const [dietName, dietText, blocksDairy] of diets) {
    for (const signal of signals) {
      for (const cycle of cycles) {
        for (const pain of pains) {
          const id = `${dietName}|${signal}|m${cycle}|${pain}`;
          if (seen.has(id)) throw new Error("duplicate lab case " + id);
          seen.add(id);
          const route = safetyRouting(painProfile(pain));
          const want = expectedRoute(pain);
          const allowed = mealAllowedByPreferences({ foodPreferences: dietText, proteinPreferences: ["chicken"], grainPreferences: ["rice"], veggiePreferences: ["broccoli"], openToOtherVeggies: true }, cottage);
          const symptom = signal === "symptom";
          const value = signal === "high" ? 5 : 2;
          const row = state(cycle, value, 14, symptom);
          if (signal === "low-recovery") row.checkins = row.checkins.map((c) => ({ ...c, energy: 2, training: 2, sleep: 4, nutrition: 4 }));
          if (signal === "low-sleep") row.checkins = row.checkins.map((c) => ({ ...c, sleep: 2, energy: 4, training: 4, nutrition: 4 }));
          if (signal === "low-nutrition") row.checkins = row.checkins.map((c) => ({ ...c, nutrition: 2, energy: 4, sleep: 4, training: 4 }));
          const built = buildSignals(row, basePlan, {}, 30);
          const delta = deterministicDelta(built, basePlan);
          const rejected = validateDelta({ ...delta, trainingAction: "progress" }, { ...built, symptomFlag: true }, basePlan);
          const trace = await makeTrace({ kind: cycle === 1 ? "initial-generation" : "next-cycle", appVersion: "0.14.1", cycleNumber: cycle, input: { caseId: id }, output: { decision: delta.trainingAction }, deterministic: { gate: want.status }, reviewers: [], decision: delta.trainingAction, authority: "DETERMINISTIC", notes: [id] });
          const ok = route.status === want.status && route.trainingRestricted === want.trainingRestricted && allowed === !blocksDairy && (symptom ? delta.trainingAction === "hold" : delta.trainingAction !== "hold") && rejected.ok === false && trace.privacy.rawProfileStoredInTrace === false && trace.privacy.rawPromptStoredInTrace === false && !digests.has(trace.inputDigest);
          digests.add(trace.inputDigest);
          check(`lab case ${id}`, ok, `${route.status}/${delta.trainingAction}/dairy:${allowed}`);
          n++;
        }
      }
    }
  }
  check("lab case matrix is 1000 distinct ids", n === 1000 && seen.size === 1000, String(n));
}
