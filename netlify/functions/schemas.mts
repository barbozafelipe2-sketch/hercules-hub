import { z } from "zod";
const textList=(max=16)=>z.array(z.string().min(1).max(80)).max(max).default([]);
const boundedRecord=<T extends z.ZodTypeAny>(value:T,max:number)=>z.record(value).superRefine((obj,ctx)=>{if(Object.keys(obj).length>max)ctx.addIssue({code:z.ZodIssueCode.custom,message:`Too many record keys (max ${max})`})});
const JsonPrimitive=z.union([z.string().max(5000),z.number().finite(),z.boolean(),z.null()]);
export const BoundedJson:z.ZodType<unknown>=z.lazy(()=>z.union([JsonPrimitive,z.array(BoundedJson).max(250),boundedRecord(BoundedJson,500)]));
export const ProfileSchema=z.object({
  name:z.string().min(1).max(60),
  language:z.enum(["pt-BR","en-US","es"]),
  primaryGoal:z.enum(["build_muscle","general_fitness","fat_loss","consistency","strength"]),
  level:z.enum(["beginner","intermediate","advanced"]),
  days:z.array(z.enum(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])).min(2).max(7),
  location:z.enum(["gym","home","both"]),minutes:z.enum(["20","30","45","60"]),preferredTime:z.string().max(120).optional().default(""),
  units:z.enum(["metric","imperial"]).default("imperial"),height:z.string().max(12).optional().default(""),weight:z.string().max(12).optional().default(""),targetWeight:z.string().max(12).optional().default(""),
  meals:z.enum(["2","3","4","5"]),cooking:z.enum(["minimal","basic","comfortable"]),foodPreferences:z.string().max(1200).optional().default(""),dislikes:z.string().max(1200).optional().default(""),allergies:z.string().max(1200).optional().default(""),
  proteinPreferences:textList(),grainPreferences:textList(),veggiePreferences:textList(),openToOtherVeggies:z.boolean().default(true),foodStyles:textList(12),mealPrepPreference:z.enum(["mixed","fresh_daily","batch_cook"]).default("mixed"),eatOutFrequency:z.enum(["rare","1-2_week","3plus_week"]).default("1-2_week"),
  sleep:z.enum(["<5","5","6","7","8","9+"]),stress:z.string().regex(/^[1-5]$/),currentPain:z.enum(["yes","no"]),painAreas:z.array(z.enum(["shoulder","elbow","wrist_hand","neck","upper_back","low_back","hip","knee","ankle_foot","other"])).max(10).default([]),redFlags:z.enum(["yes","no"]),professionalRestrictions:z.enum(["yes","no"]),professionalRestrictionScope:z.enum(["","avoid_specific","no_exercise","other_guidance"]).default(""),safetyDetails:z.string().max(2000).optional().default(""),
  accuracy:z.boolean(),prototypeAck:z.boolean()
}).strict();

const LocalizedTextSchema=z.object({pt:z.string().min(1).max(180),en:z.string().min(1).max(180),es:z.string().min(1).max(180)}).strict();
export const GeneratedMealSchema=z.object({
  id:z.string().regex(/^GEN-MEAL-[A-Z0-9-]{6,40}$/),role:z.enum(["breakfast","lunch","snack","dinner"]),title:LocalizedTextSchema,
  ingredients:z.array(z.string().min(1).max(80)).min(2).max(12),protein:z.string().max(80).default(""),grain:z.string().max(80).default(""),veggies:textList(10),styles:textList(8),
  prep:LocalizedTextSchema,substitutions:LocalizedTextSchema,source:z.literal("ai-generated"),createdForCycle:z.number().int().min(1).max(600),image:z.string().max(180).default(""),assetStatus:z.enum(["new_asset_required","approved_asset"]).default("new_asset_required")
}).strict();
export const GeneratedExerciseSchema=z.object({
  id:z.string().regex(/^GEN-EX-[A-Z0-9-]{6,40}$/),session:z.enum(["fullA","fullB","fullC","upperA","upperB","lowerA","lowerB"]),mode:z.enum(["gym","home","both"]),title:LocalizedTextSchema,
  rx:z.string().min(1).max(100),focus:z.string().min(1).max(100),instructions:LocalizedTextSchema,source:z.literal("ai-generated"),createdForCycle:z.number().int().min(1).max(600),image:z.string().max(180).default("")
}).strict();
export const CatalogSchema=z.object({
  schema:z.literal("hercules-catalog-v1"),strategy:z.object({ingredientReuse:z.enum(["low","balanced","high"]),variety:z.enum(["steady","balanced","high"]),reason:z.string().max(500)}).strict(),
  meals:z.array(GeneratedMealSchema).max(24).default([]),exercises:z.array(GeneratedExerciseSchema).max(16).default([]),lastAdaptedCycle:z.number().int().min(1).max(600),provenance:z.enum(["bundled-only","gateway-augmented","carried-forward"])
}).strict();

export const AuditSchema=z.object({verdict:z.enum(["PASS","REVIEW","BLOCK"]),issues:z.array(z.string().max(500)).max(12),corrections:z.array(z.string().max(500)).max(12)}).strict();
export const TraceReviewerSchema=z.object({label:z.string().max(80).nullable(),provider:z.string().max(80).nullable(),model:z.string().max(160).nullable(),route:z.string().max(80).nullable(),verdict:z.string().max(80).nullable(),status:z.string().max(80)}).strict();
export const TraceSchema=z.object({schema:z.enum(["hercules-trace-v1","hercules-trace-v2"]),traceId:z.string().uuid(),createdAt:z.string().datetime(),kind:z.enum(["initial-generation","next-cycle"]),appVersion:z.string().max(40),cycleNumber:z.number().int().min(1).max(600),inputDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),outputDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),deterministic:BoundedJson,reviewers:z.array(TraceReviewerSchema).max(12),decision:z.string().max(120),authority:z.string().max(120),assetCatalog:z.string().max(160),catalog:z.object({bundledAssetManifest:z.string().max(180),generatedMeals:z.number().int().min(0).max(24),generatedExercises:z.number().int().min(0).max(16),provenance:z.string().max(80)}).strict().optional(),privacy:z.object({rawProfileStoredInTrace:z.literal(false),rawPromptStoredInTrace:z.literal(false)}).strict(),notes:z.array(z.string().max(500)).max(12)}).strict();
export const PlanSchema=z.object({
  version:z.string(),createdAt:z.string(),risk:z.enum(["green","yellow","red"]),trainingHold:z.boolean(),allergyReview:z.boolean(),
  summary:z.object({goal:z.string(),strengthDays:z.number().int().min(2).max(4),selectedDays:z.array(z.string()),minutes:z.number(),location:z.string(),meals:z.number(),level:z.string(),language:z.enum(["pt-BR","en-US","es"])}),
  training:z.object({pattern:z.array(z.string()),sets:z.number(),splitReason:z.string(),progression:z.array(z.string()).length(4),reviewRequired:z.boolean()}).passthrough(),
  nutrition:z.object({reviewRequired:z.boolean(),weeks:z.number(),meals:z.number(),slotPolicy:z.literal("role-stable"),principles:z.array(z.string())}).passthrough(),
  recover:z.object({sleep:z.string(),stress:z.number()}).passthrough(),mind:z.object({focus:z.string()}).passthrough(),track:z.object({signals:z.array(z.string())}).passthrough(),
  evolve:z.object({mode:z.string(),materialChangesAutomatic:z.boolean(),safetyReleaseAutomatic:z.boolean()}).passthrough(),
  catalog:CatalogSchema.optional()
}).passthrough();
export const GenerateRequestSchema=z.object({profile:ProfileSchema,plan:PlanSchema}).strict();
export const CoachRequestSchema=z.object({question:z.string().min(1).max(1500),profile:ProfileSchema,plan:PlanSchema,progress:BoundedJson.optional(),history:z.array(z.object({role:z.string(),text:z.string().max(1500)})).max(10).optional().default([])}).strict();

const MetricString=z.string().trim().max(24);
export const CheckinSchema=z.object({
  ts:z.string().datetime(),dayKey:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),energy:z.number().min(1).max(5),sleep:z.number().min(1).max(5),training:z.number().min(1).max(5),nutrition:z.number().min(1).max(5),painFlag:z.boolean().default(false),redFlagSymptom:z.boolean().default(false),symptomFlag:z.boolean().default(false),note:z.string().max(1200).optional().default("")
}).strict();
export const BaselineMilestoneSchema=z.object({ts:z.string().datetime(),height:MetricString.optional().default(""),weight:MetricString.min(1),targetWeight:MetricString.min(1),waist:MetricString.optional().default(""),note:z.string().max(1200).optional().default("")}).passthrough();
export const FollowupMilestoneSchema=z.object({ts:z.string().datetime(),weight:MetricString.min(1),waist:MetricString.optional().default(""),note:z.string().max(1200).optional().default("")}).passthrough();
const boolRecord=(max:number)=>boundedRecord(z.boolean(),max).default({});
export const NextCycleStateSchema=z.object({
  startedAt:z.string().datetime(),cycleNumber:z.number().int().min(1).max(600).default(1),completedSessions:boolRecord(500),completedExercises:boolRecord(2500),checkins:z.array(CheckinSchema).max(90).default([]),baseline:BaselineMilestoneSchema.nullable(),checkpoint:FollowupMilestoneSchema.nullable(),finalMark:FollowupMilestoneSchema.nullable()
}).passthrough();
export const ClientStateSchema=z.object({
  startedAt:z.union([z.literal(""),z.string().datetime()]),cycleNumber:z.number().int().min(1).max(600).default(1),week:z.number().int().min(1).max(8).default(1),
  nav:z.enum(["HOME","TRAIN","NOURISH","RECOVER","MIND","TRACK","EVOLVE"]).default("HOME"),trainingMode:z.enum(["gym","home"]).default("gym"),
  completedExercises:boolRecord(2500),completedSessions:boolRecord(500),habits:boolRecord(250),checkins:z.array(CheckinSchema).max(90).default([]),
  mealWeek:z.number().int().min(1).max(8).default(1),mealDay:z.number().int().min(0).max(7).default(0),mealSlot:z.number().int().min(0).max(12).default(0),
  audit:z.array(AuditSchema).max(3).nullable().optional().default(null),labQA:BoundedJson.nullable().optional().default(null),traceLab:z.array(TraceSchema).max(40).optional().default([]),
  baseline:BaselineMilestoneSchema.nullable().optional().default(null),checkpoint:FollowupMilestoneSchema.nullable().optional().default(null),finalMark:FollowupMilestoneSchema.nullable().optional().default(null),
  postWorkout:z.object({pending:z.boolean(),session:z.string().max(160),mindDone:z.boolean()}).strict().default({pending:false,session:"",mindDone:false}),
  nextCycle:BoundedJson.nullable().optional().default(null),cycleHistory:z.array(BoundedJson).max(120).default([]),sync:z.object({persistent:z.boolean(),lastSyncedAt:z.string().max(60)}).strict().default({persistent:false,lastSyncedAt:""})
}).catchall(BoundedJson);
export const StateSyncSchema=z.object({profile:ProfileSchema.nullable().optional(),plan:PlanSchema.nullable().optional(),state:ClientStateSchema,chat:z.array(z.object({role:z.string().max(20),text:z.string().max(1500)})).max(50).default([]),cycleNumber:z.number().int().min(1).max(600).optional()}).strict();
export const RestoreDataSchema=z.object({
  language:z.enum(["pt-BR","en-US","es"]),profile:ProfileSchema,plan:PlanSchema,state:ClientStateSchema,
  chat:z.array(z.object({role:z.string().max(20),text:z.string().max(1500)})).max(50).default([]),cycleNumber:z.number().int().min(1).max(600)
}).strict();
export const RestoreRequestSchema=z.object({
  schema:z.literal("hercules-backup-v1"),appVersion:z.string().min(1).max(40),exportedAt:z.string().datetime(),
  data:z.string().min(1).max(500000),integrity:z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).strict();

export const CycleSummarySchema=z.object({
  completion:z.object({tr:z.number().min(0).max(100),track:z.number().min(0).max(100),overall:z.number().min(0).max(100)}).strict(),
  elapsedDays:z.number().int().min(0).max(730),baseline:BaselineMilestoneSchema.nullable(),checkpoint:FollowupMilestoneSchema.nullable(),finalMark:FollowupMilestoneSchema.nullable(),
  checkins:z.array(CheckinSchema).max(90),completedSessions:boundedRecord(z.boolean(),500),completedExercises:boundedRecord(z.boolean(),2500),cycleNumber:z.number().int().min(1).max(600)
}).strict();
export const NextCycleDeltaSchema=z.object({
  trainingAction:z.enum(["hold","consolidate","maintain","progress"]),
  nutritionAction:z.enum(["simplify","maintain","rotate"]),
  recoveryAction:z.enum(["prioritize","maintain"]),
  mindAction:z.enum(["simplify","maintain"]),
  evidence:z.array(z.string().max(220)).max(12),
  unknowns:z.array(z.string().max(100)).max(12)
}).strict();
export const ReviewVerdictSchema=z.object({verdict:z.enum(["PASS","REVIEW","REJECT"]),issues:z.array(z.string().max(500)).max(12)}).strict();
export const FinalApprovalSchema=z.object({decision:z.enum(["APPROVE","REJECT"]),issues:z.array(z.string().max(500)).max(12)}).strict();
export const NextCycleRequestSchema=z.object({profile:ProfileSchema,currentPlan:PlanSchema,state:NextCycleStateSchema,cycleSummary:CycleSummarySchema}).strict();
