const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()"};
const cookieBase="Path=/; HttpOnly; Secure; SameSite=Lax";
const clearCookies=["kc_access=; "+cookieBase+"; Max-Age=0","kc_refresh=; "+cookieBase+"; Max-Age=0"];
const json=(data,status=200,extra={})=>{const h=new Headers(headers);for(const [k,v] of Object.entries(extra)){if(k.toLowerCase()==="set-cookie"&&Array.isArray(v))v.forEach(x=>h.append(k,x));else h.set(k,v)}return new Response(JSON.stringify(data),{status,headers:h})};
const cookies=(access,refresh,expires=3600,remember=true)=>{
 const age=remember?"; Max-Age=":"";
 return [
  "kc_access="+encodeURIComponent(access)+"; "+cookieBase+age+(remember?expires:""),
  "kc_refresh="+encodeURIComponent(refresh)+"; "+cookieBase+age+(remember?expires*24*30:"")
 ];
};
const rememberCookie=(remember)=>"kc_remember="+(remember?"1":"0")+"; "+cookieBase+"; Max-Age="+(remember?60*60*24*30:0);
function readCookie(req,name){const raw=req.headers.get("Cookie")||"";const m=raw.match(new RegExp("(?:^|;\\s*)"+name+"=([^;]*)"));return m?decodeURIComponent(m[1]):""}
function config(env){if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("إعدادات Supabase غير مكتملة في Cloudflare.");return {url:env.SUPABASE_URL.replace(/\/+$/,""),anon:env.SUPABASE_ANON_KEY,service:env.SUPABASE_SERVICE_ROLE_KEY}}
async function sb(url,key,options={}){const {token,...init}=options;const r=await fetch(url,{...init,headers:{"apikey":key,"Authorization":"Bearer "+(token||key),...(init.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(_){d={message:t}}if(!r.ok)throw new Error(d.msg||d.message||d.error_description||d.error||"فشل طلب Supabase");return d}
function usernameEmail(u){return u.toLowerCase()+"@accounts.kareem-chemistry.invalid"}
async function body(req){
 const length=Number(req.headers.get("Content-Length")||0);
 if(length>131072)throw new Error("حجم الطلب أكبر من المسموح.");
 try{const raw=await req.text();if(new TextEncoder().encode(raw).length>131072)throw new Error("حجم الطلب أكبر من المسموح.");return JSON.parse(raw)}catch(e){if(e.message==="حجم الطلب أكبر من المسموح.")throw e;throw new Error("بيانات الطلب غير صالحة.")}
}
function sameOrigin(req){const origin=req.headers.get("Origin");if(!origin)return false;try{return new URL(origin).origin===new URL(req.url).origin}catch(_){return false}}
async function rateLimit(req,c,scope,limit,windowSeconds){
 const ip=req.headers.get("CF-Connecting-IP")||"unknown";
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(scope+"|"+ip));
 const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 return await sb(c.url+"/rest/v1/rpc/consume_rate_limit",c.service,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({p_key:key,p_limit:limit,p_window_seconds:windowSeconds})})===true;
}
async function limited(req,c,scope,limit,windowSeconds){
 try{if(await rateLimit(req,c,scope,limit,windowSeconds))return null;return json({error:"تم تجاوز عدد المحاولات المسموح به. حاول مرة أخرى لاحقًا."},429)}
 catch(_){return json({error:"حماية الطلبات تحتاج إلى تفعيل ترقية قاعدة البيانات قبل استخدام هذه العملية."},503)}
}
async function currentUser(req,c){const access=readCookie(req,"kc_access"),refresh=readCookie(req,"kc_refresh");if(!access&&!refresh)return null;
 try{return {user:await sb(c.url+"/auth/v1/user",c.anon,{token:access}),rotated:null}}
 catch(_){if(!refresh)return null;
  try{const d=await sb(c.url+"/auth/v1/token?grant_type=refresh_token",c.anon,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refresh})});return {user:await sb(c.url+"/auth/v1/user",c.anon,{token:d.access_token}),rotated:d,remember:readCookie(req,"kc_remember")==="1"}}
  catch(__){return null}
 }
}
function userShape(u){return {id:u.id,username:u.user_metadata?.username||"",display_name:u.user_metadata?.display_name||"",role:u.app_metadata?.role==="admin"?"admin":"student"}}
export async function onRequest({request,env}){
 let c;try{c=config(env)}catch(e){return json({error:e.message},503)}
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,"").replace(/\/+$/,"");
 try{
  if(request.method==="POST"&&!sameOrigin(request))return json({error:"مصدر الطلب غير موثوق."},403);
  if(path==="auth/register"&&request.method==="POST"){
   const blocked=await limited(request,c,"register",5,3600);if(blocked)return blocked;
   const b=await body(request),username=String(b.username||"").trim(),display_name=String(b.display_name||"").trim(),password=String(b.password||"");
   if(!/^[A-Za-z0-9_]{3,24}$/.test(username))return json({error:"اسم المستخدم يجب أن يكون 3–24 حرفًا إنجليزيًا أو رقمًا أو _."},400);
   if(display_name.length<2||display_name.length>50)return json({error:"اكتب اسمًا من حرفين إلى 50 حرفًا."},400);
   if(password.length<10||password.length>128)return json({error:"كلمة المرور يجب أن تكون 10 أحرف على الأقل."},400);
   const email=usernameEmail(username);
   const created=await sb(c.url+"/auth/v1/admin/users",c.service,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{username:username.toLowerCase(),display_name},app_metadata:{role:"student"}})});
   try{await sb(c.url+"/rest/v1/student_profiles",c.service,{method:"POST",headers:{"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({id:created.id,username:username.toLowerCase(),display_name})})}
   catch(e){await fetch(c.url+"/auth/v1/admin/users/"+created.id,{method:"DELETE",headers:{"apikey":c.service,"Authorization":"Bearer "+c.service}});throw e}
   const login=await sb(c.url+"/auth/v1/token?grant_type=password",c.anon,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
   return json({user:userShape(login.user||created)},200,{"Set-Cookie":[...cookies(login.access_token,login.refresh_token,3600,false),rememberCookie(false)]});
  }
  if(path==="auth/login"&&request.method==="POST"){
   const blocked=await limited(request,c,"login",10,900);if(blocked)return blocked;
   const b=await body(request),username=String(b.username||"").trim(),password=String(b.password||"");
   if(!/^[A-Za-z0-9_]{3,24}$/.test(username)||!password)return json({error:"اسم المستخدم أو كلمة المرور غير صحيحة."},401);
   const d=await sb(c.url+"/auth/v1/token?grant_type=password",c.anon,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:usernameEmail(username),password})});
   const remember=b.remember===true;
   return json({user:userShape(d.user)},200,{"Set-Cookie":[...cookies(d.access_token,d.refresh_token,3600,remember),rememberCookie(remember)]});
  }
  if(path==="auth/logout"&&request.method==="POST"){
   try{
    const session=await currentUser(request,c);
    if(session){const token=session.rotated?.access_token||readCookie(request,"kc_access");if(token)await sb(c.url+"/auth/v1/logout",c.anon,{token,method:"POST"})}
   }catch(_){}
   return json({ok:true},200,{"Set-Cookie":[...clearCookies,rememberCookie(false)]});
  }
  if(path==="auth/me"&&request.method==="GET"){
   const session=await currentUser(request,c);if(!session)return json({error:"غير مسجل الدخول."},401,{"Set-Cookie":[...clearCookies,rememberCookie(false)]});
   const extra=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token,3600,session.remember)}:{};
   return json({user:userShape(session.user)},200,extra);
  }
  if(path==="student/data"&&(request.method==="GET"||request.method==="PUT")){
   const session=await currentUser(request,c);if(!session)return json({error:"سجّل الدخول أولًا."},401);
   const token=session.rotated?.access_token||readCookie(request,"kc_access");
   if(request.method==="GET"){
    const rows=await sb(c.url+"/rest/v1/student_data?select=progress&user_id=eq."+encodeURIComponent(session.user.id)+"&limit=1",c.anon,{token});
    const extra=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token,3600,session.remember)}:{};
    return json({progress:rows[0]?.progress||null},200,extra);
   }
   const b=await body(request),allowed=["kareemStudentStats","kareemStudentName","kareemStudentTasks","kareemStudentNotes","kareemFocusCompleted","kq"],progress={};
   for(const k of allowed)if(typeof b.progress?.[k]==="string")progress[k]=b.progress[k];
   if(JSON.stringify(progress).length>100000)return json({error:"حجم بيانات المذاكرة أكبر من المسموح."},413);
   await sb(c.url+"/rest/v1/student_data?on_conflict=user_id",c.anon,{token,method:"POST",headers:{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:session.user.id,progress,updated_at:new Date().toISOString()})});
   const extra=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token,3600,session.remember)}:{};
   return json({ok:true},200,extra);
  }
  if(path.startsWith("admin/")){
   const session=await currentUser(request,c);
   if(!session)return json({error:"سجّل الدخول بحساب الأدمن أولًا."},401);
   if(session.user.app_metadata?.role!=="admin")return json({error:"غير مصرح. هذه الصفحة للأدمن فقط."},403);
   const rotated=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token,3600,session.remember)}:{};
   if(path==="admin/overview"&&request.method==="GET"){
    const [students,data,questions]=await Promise.all([
     sb(c.url+"/rest/v1/student_profiles?select=id,username,display_name,created_at&order=created_at.desc&limit=1000",c.service),
     sb(c.url+"/rest/v1/student_data?select=user_id,updated_at&limit=1000",c.service),
     sb(c.url+"/rest/v1/admin_questions?select=id&limit=1000",c.service)
    ]);
    const week=Date.now()-7*24*60*60*1000;
    return json({stats:{students:students.length,questions:questions.length,activeStudents:data.filter(x=>x.updated_at&&Date.parse(x.updated_at)>=week).length,trackedStudents:data.length},recentStudents:students.slice(0,5)},200,rotated);
   }
   if(path==="admin/students"&&request.method==="GET"){
    const [students,data]=await Promise.all([
     sb(c.url+"/rest/v1/student_profiles?select=id,username,display_name,created_at&order=created_at.desc&limit=1000",c.service),
     sb(c.url+"/rest/v1/student_data?select=user_id,updated_at&limit=1000",c.service)
    ]);
    const byId=new Map(data.map(x=>[x.user_id,x]));
    return json({students:students.map(s=>{const d=byId.get(s.id);return {...s,last_activity:d?.updated_at||null}})},200,rotated);
   }
   if(path==="admin/students/update"&&request.method==="POST"){
    const b=await body(request),id=String(b.id||""),display_name=String(b.display_name||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(id)||display_name.length<2||display_name.length>50)return json({error:"راجع الاسم والبيانات."},400);
    await sb(c.url+"/rest/v1/student_profiles?id=eq."+encodeURIComponent(id),c.service,{method:"PATCH",headers:{"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({display_name,updated_at:new Date().toISOString()})});
    await sb(c.url+"/auth/v1/admin/users/"+id,c.service,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_metadata:{display_name}})});
    return json({ok:true},200,rotated);
   }
   if(path==="admin/students/delete"&&request.method==="POST"){
    const b=await body(request),id=String(b.id||"");
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"معرّف الحساب غير صالح."},400);
    if(id===session.user.id)return json({error:"لا يمكن حذف حساب الأدمن المستخدم حاليًا."},400);
    await sb(c.url+"/auth/v1/admin/users/"+id,c.service,{method:"DELETE"});
    return json({ok:true},200,rotated);
   }
   if(path==="admin/questions"&&request.method==="GET"){
    const rows=await sb(c.url+"/rest/v1/admin_questions?select=id,title,chapter,difficulty,question,options,correct_answer,explanation,enabled,created_at,updated_at&order=created_at.desc&limit=1000",c.service);
    return json({questions:rows},200,rotated);
   }
   if(path==="admin/questions"&&(request.method==="POST"||request.method==="PUT")){
    const b=await body(request),title=String(b.title||"").trim(),chapter=String(b.chapter||"").trim(),question=String(b.question||"").trim(),explanation=String(b.explanation||"").trim(),options=Array.isArray(b.options)?b.options.map(x=>String(x).trim()).filter(Boolean):[],correct_answer=Number(b.correct_answer);
    if(title.length<3||title.length>160||chapter.length>80||question.length<5||question.length>3000||options.length<2||options.length>6||options.some(x=>x.length>500)||!Number.isInteger(correct_answer)||correct_answer<0||correct_answer>=options.length||explanation.length>2000)return json({error:"راجع السؤال والاختيارات وحدد إجابة صحيحة."},400);
    const record={title,chapter,difficulty:["سهل","متوسط","صعب"].includes(b.difficulty)?b.difficulty:"متوسط",question,options,correct_answer,explanation,enabled:b.enabled!==false,updated_at:new Date().toISOString()};
    if(request.method==="POST"){
     const rows=await sb(c.url+"/rest/v1/admin_questions",c.service,{method:"POST",headers:{"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(record)});
     return json({question:rows[0]},201,rotated);
    }
    const id=String(b.id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"معرّف السؤال غير صالح."},400);
    const rows=await sb(c.url+"/rest/v1/admin_questions?id=eq."+encodeURIComponent(id),c.service,{method:"PATCH",headers:{"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(record)});
    return json({question:rows[0]||null},200,rotated);
   }
   if(path==="admin/questions/delete"&&request.method==="POST"){
    const b=await body(request),id=String(b.id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"معرّف السؤال غير صالح."},400);
    await sb(c.url+"/rest/v1/admin_questions?id=eq."+encodeURIComponent(id),c.service,{method:"DELETE"});
    return json({ok:true},200,rotated);
   }
  }
  if(path==="ai/chat"&&request.method==="POST"){
   if(!env.GEMINI_API_KEY&&!env.OPENAI_API_KEY)return json({error:"المساعد الذكي غير مفعّل بعد؛ تعمل الردود المدمجة حاليًا."},503);
   const session=await currentUser(request,c);if(!session)return json({error:"سجّل الدخول لاستخدام المساعد الذكي."},401);
   const blocked=await limited(request,c,"ai-chat:"+session.user.id,20,600);if(blocked)return blocked;
   const b=await body(request),message=String(b.message||"").trim();
   if(!message||message.length>4000)return json({error:"اكتب سؤالًا لا يتجاوز 4000 حرف."},400);
   const history=Array.isArray(b.history)?b.history.slice(-10).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").map(x=>({role:x.role,content:x.content.slice(0,4000)})):[];
   const system="أنت مساعد كريم إبراهيم لتدريس الكيمياء للصف الثالث الثانوي في مصر. اشرح بالعامية المصرية الواضحة، واذكر المعطيات والقانون وخطوات الحل والوحدة في المسائل. اكتب الصيغ الكيميائية بوضوح، ولا تخترع معلومة عند عدم التأكد. التزم بالكيمياء والمنهج الدراسي.";
   if(env.GEMINI_API_KEY){
    const contents=history.map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:x.content}]}));
    contents.push({role:"user",parts:[{text:message}]});
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents})});
    const raw=await response.text();
    let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={}};
    if(!response.ok){
     const providerMessage=String(data.error?.message||data.message||"No provider error message").slice(0,500);
     console.error("[ai/chat] Gemini provider error",{status:response.status,message:providerMessage});
     return json({error:"تعذر على Gemini معالجة الطلب. حاول مرة أخرى لاحقًا."},502);
    }
    const reply=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("").trim();
    if(!reply)return json({error:"لم يصل رد من المساعد."},502);
    return json({reply});
   }
   if(env.OPENAI_API_KEY){
    const messages=[{role:"system",content:system},...history,{role:"user",content:message}];
    const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+env.OPENAI_API_KEY},body:JSON.stringify({model:"gpt-4o-mini",messages,max_tokens:1200})});
    const data=await response.json();if(!response.ok)throw new Error("فشل مزود OpenAI.");
    const reply=String(data.choices?.[0]?.message?.content||"").trim();
    if(!reply)return json({error:"لم يصل رد من المساعد."},502);
    return json({reply});
   }
   return json({error:"المساعد الذكي غير مفعّل بعد؛ تعمل الردود المدمجة حاليًا."},503);
  }
  if(path==="questions/start"&&request.method==="POST"){
   const session=await currentUser(request,c);if(!session)return json({error:"سجّل الدخول لبدء الاختبار."},401);
   const blocked=await limited(request,c,"question-start:"+session.user.id,20,3600);if(blocked)return blocked;
   const b=await body(request),ids=Array.isArray(b.question_ids)?[...new Set(b.question_ids.map(String))]:[];
   if(!ids.length||ids.length>100||ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return json({error:"قائمة الأسئلة غير صالحة."},400);
   const rows=await sb(c.url+"/rest/v1/admin_questions?select=id&enabled=eq.true&id=in.("+ids.map(encodeURIComponent).join(",")+")&limit=100",c.service);
   if(rows.length!==ids.length)return json({error:"بعض الأسئلة لم تعد متاحة. حدّث الصفحة وحاول مجددًا."},409);
   const created=await sb(c.url+"/rest/v1/question_attempts",c.service,{method:"POST",headers:{"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({user_id:session.user.id,question_ids:ids})});
   return json({attempt_id:created[0].id},201);
  }
  if(path==="questions/answer"&&request.method==="POST"){
   const session=await currentUser(request,c);if(!session)return json({error:"سجّل الدخول أولًا."},401);
   const blocked=await limited(request,c,"question-answer:"+session.user.id,120,600);if(blocked)return blocked;
   const b=await body(request),attemptId=String(b.attempt_id||""),questionId=String(b.question_id||""),answer=Number(b.answer_index);
   if(!/^[0-9a-f-]{36}$/i.test(attemptId)||!/^[0-9a-f-]{36}$/i.test(questionId)||!Number.isInteger(answer)||answer<0||answer>5)return json({error:"بيانات الإجابة غير صالحة."},400);
   const attempts=await sb(c.url+"/rest/v1/question_attempts?select=id,question_ids&user_id=eq."+encodeURIComponent(session.user.id)+"&id=eq."+encodeURIComponent(attemptId)+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1",c.service);
   if(!attempts.length||!attempts[0].question_ids.includes(questionId))return json({error:"جلسة الاختبار غير صالحة أو انتهت."},403);
   const existing=await sb(c.url+"/rest/v1/question_attempt_answers?select=selected_answer,correct_answer,is_correct,explanation&attempt_id=eq."+encodeURIComponent(attemptId)+"&question_id=eq."+encodeURIComponent(questionId)+"&limit=1",c.service);
   if(existing.length)return json({correct:existing[0].is_correct,correct_answer:existing[0].correct_answer,explanation:existing[0].explanation,already_answered:true});
   const questions=await sb(c.url+"/rest/v1/admin_questions?select=options,correct_answer,explanation&enabled=eq.true&id=eq."+encodeURIComponent(questionId)+"&limit=1",c.service);
   if(!questions.length||answer>=questions[0].options.length)return json({error:"السؤال أو الاختيار غير متاح."},404);
   const q=questions[0],correct=answer===q.correct_answer;
   const saved=await sb(c.url+"/rest/v1/question_attempt_answers",c.service,{method:"POST",headers:{"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({attempt_id:attemptId,question_id:questionId,selected_answer:answer,correct_answer:q.correct_answer,is_correct:correct,explanation:q.explanation})});
   return json({correct,correct_answer:q.correct_answer,explanation:q.explanation});
  }
  if(path==="questions/active"&&request.method==="GET"){
   const session=await currentUser(request,c);if(!session)return json({error:"سجّل الدخول لعرض الأسئلة."},401);
   const rows=await sb(c.url+"/rest/v1/admin_questions?select=id,title,chapter,difficulty,question,options&enabled=eq.true&order=created_at.desc&limit=500",c.service);
   const extra=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token,3600,session.remember)}:{};
   return json({questions:rows},200,extra);
  }
  return json({error:"المسار غير موجود."},404);
 }catch(e){
  const m=String(e.message||"");
  if(path==="auth/register"&&/already registered|already been registered|already exists|duplicate key|unique constraint/i.test(m))return json({error:"اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر."},409);
  if(/duplicate key|unique constraint/i.test(m))return json({error:"تم تسجيل هذه الإجابة بالفعل."},409);
  if(/Invalid login credentials/i.test(m))return json({error:"اسم المستخدم أو كلمة المرور غير صحيحة."},401);
  if(path==="ai/chat"){console.error("[ai/chat] internal request error",{message:m.slice(0,500)});return json({error:"تعذر إكمال الطلب بسبب خطأ داخلي. حاول لاحقًا."},500)}
  return json({error:"تعذر إكمال الطلب بسبب خطأ داخلي. حاول لاحقًا."},500);
 }
}
