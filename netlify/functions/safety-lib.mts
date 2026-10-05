export function hasMeaningfulText(x){const t=String(x||"").trim().toLowerCase();return !!t&&!["none","nenhuma","nenhum","não","nao","no","n/a","na","ninguna","ninguno"].includes(t)}
export function safetyRouting(profile){
  const redFlag=profile?.redFlags==="yes";
  const professionalNoExercise=profile?.professionalRestrictions==="yes"&&profile?.professionalRestrictionScope==="no_exercise";
  const painReview=profile?.currentPain==="yes";
  const professionalReview=profile?.professionalRestrictions==="yes"&&!professionalNoExercise;
  const detailsReview=hasMeaningfulText(profile?.safetyDetails)&&!redFlag&&!professionalNoExercise;
  const reasons=[];
  if(painReview)reasons.push("PAIN_LIMITATION");
  if(redFlag)reasons.push("RED_FLAG_SYMPTOM");
  if(professionalNoExercise)reasons.push("PROFESSIONAL_NO_EXERCISE"); else if(professionalReview)reasons.push("PROFESSIONAL_GUIDANCE");
  if(detailsReview&&!painReview&&!professionalReview)reasons.push("SAFETY_DETAILS_REVIEW");
  const trainingRestricted=redFlag||professionalNoExercise;
  return {status:trainingRestricted?"RESTRICTED":reasons.length?"REVIEW_NOTIFY":"CLEAR",trainingRestricted,ownerReviewRequired:reasons.length>0,reasons,painAreas:[...(profile?.painAreas||[])],professionalRestrictionScope:profile?.professionalRestrictionScope||""};
}
