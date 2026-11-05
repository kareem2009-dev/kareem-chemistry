const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const cookieBase="Path=/; HttpOnly; Secure; SameSite=Lax";
const clearCookies=["kc_access=; "+cookieBase+"; Max-Age=0","kc_refresh=; "+cookieBase+"; Max-Age=0"];
const json=(data,status=200,extra={})=>{const h=new Headers(headers);for(const [k,v] of Object.entries(extra)){if(k.toLowerCase()==="set-cookie"&&Array.isArray(v))v.forEach(x=>h.append(k,x));else h.set(k,v)}return new Response(JSON.stringify(data),{status,headers:h})};
const cookies=(access,refresh,expires=3600)=>[
 "kc_access="+encodeURIComponent(access)+"; "+cookieBase+"; Max-Age="+expires,
 "kc_refresh="+encodeURIComponent(refresh)+"; "+cookieBase+"; Max-Age="+(expires*24*30)
];
function readCookie(req,name){const raw=req.headers.get("Cookie")||"";const m=raw.match(new RegExp("(?:^|;\\s*)"+name+"=([^;]*)"));return m?decodeURIComponent(m[1]):""}
function config(env){if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("إعدادات Supabase غير مكتملة في Cloudflare.");return {url:env.SUPABASE_URL.replace(/\/+$/,""),anon:env.SUPABASE_ANON_KEY,service:env.SUPABASE_SERVICE_ROLE_KEY}}
async function sb(url,key,options={}){const {token,...init}=options;const r=await fetch(url,{...init,headers:{"apikey":key,"Authorization":"Bearer "+(token||key),...(init.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(_){d={message:t}}if(!r.ok)throw new Error(d.msg||d.message||d.error_description||d.error||"فشل طلب Supabase");return d}
function usernameEmail(u){return u.toLowerCase()+"@accounts.kareem-chemistry.invalid"}
async function body(req){try{return await req.json()}catch(_){throw new Error("بيانات الطلب غير صالحة.")}}
async function currentUser(req,c){const access=readCookie(req,"kc_access"),refresh=readCookie(req,"kc_refresh");if(!access&&!refresh)return null;
 try{return {user:await sb(c.url+"/auth/v1/user",c.anon,{token:access}),rotated:null}}
 catch(_){if(!refresh)return null;
  try{const d=await sb(c.url+"/auth/v1/token?grant_type=refresh_token",c.anon,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refresh})});return {user:await sb(c.url+"/auth/v1/user",c.anon,{token:d.access_token}),rotated:d}}
  catch(__){return null}
 }
}
function userShape(u){return {id:u.id,username:u.user_metadata?.username||"",display_name:u.user_metadata?.display_name||"",role:u.app_metadata?.role==="admin"?"admin":"student"}}
export async function onRequest({request,env}){
 let c;try{c=config(env)}catch(e){return json({error:e.message},503)}
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,"").replace(/\/+$/,"");
 try{
  if(path==="auth/register"&&request.method==="POST"){
   const b=await body(request),username=String(b.username||"").trim(),display_name=String(b.display_name||"").trim(),password=String(b.password||"");
   if(!/^[A-Za-z0-9_]{3,24}$/.test(username))return json({error:"اسم المستخدم يجب أن يكون 3–24 حرفًا إنجليزيًا أو رقمًا أو _."},400);
   if(display_name.length<2||display_name.length>50)return json({error:"اكتب اسمًا من حرفين إلى 50 حرفًا."},400);
   if(password.length<10||password.length>128)return json({error:"كلمة المرور يجب أن تكون 10 أحرف على الأقل."},400);
   const email=usernameEmail(username);
   const created=await sb(c.url+"/auth/v1/admin/users",c.service,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{username:username.toLowerCase(),display_name},app_metadata:{role:"student"}})});
   try{await sb(c.url+"/rest/v1/student_profiles",c.service,{method:"POST",headers:{"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({id:created.id,username:username.toLowerCase(),display_name})})}
   catch(e){await fetch(c.url+"/auth/v1/admin/users/"+created.id,{method:"DELETE",headers:{"apikey":c.service,"Authorization":"Bearer "+c.service}});throw e}
   const login=await sb(c.url+"/auth/v1/token?grant_type=password",c.anon,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
   return json({user:userShape(login.user||created)},200,{"Set-Cookie":cookies(login.access_token,login.refresh_token)});
  }
  if(path==="auth/login"&&request.method==="POST"){
   const b=await body(request),username=String(b.username||"").trim(),password=String(b.password||"");
   if(!/^[A-Za-z0-9_]{3,24}$/.test(username)||!password)return json({error:"اسم المستخدم أو كلمة المرور غير صحيحة."},401);
   const d=await sb(c.url+"/auth/v1/token?grant_type=password",c.anon,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:usernameEmail(username),password})});
   return json({user:userShape(d.user)},200,{"Set-Cookie":cookies(d.access_token,d.refresh_token)});
  }
  if(path==="auth/logout"&&request.method==="POST")return json({ok:true},200,{"Set-Cookie":clearCookies});
  if(path==="auth/me"&&request.method==="GET"){
   const session=await currentUser(request,c);if(!session)return json({error:"غير مسجل الدخول."},401,{"Set-Cookie":clearCookies});
   const extra=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token)}:{};
   return json({user:userShape(session.user)},200,extra);
  }
  if(path==="admin/students"&&request.method==="GET"){
   const session=await currentUser(request,c);if(!session)return json({error:"سجّل الدخول أولًا."},401);
   if(session.user.app_metadata?.role!=="admin")return json({error:"ليس لديك صلاحية الوصول إلى هذه الصفحة."},403);
   const rows=await sb(c.url+"/rest/v1/student_profiles?select=username,display_name,created_at&order=created_at.desc&limit=500",c.anon,{token:session.rotated?.access_token||readCookie(request,"kc_access")});
   const extra=session.rotated?{"Set-Cookie":cookies(session.rotated.access_token,session.rotated.refresh_token)}:{};
   return json({students:rows},200,extra);
  }
  return json({error:"المسار غير موجود."},404);
 }catch(e){
  const m=String(e.message||"");
  if(/already registered|already been registered|already exists|duplicate key|unique constraint/i.test(m))return json({error:"اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر."},409);
  if(/Invalid login credentials/i.test(m))return json({error:"اسم المستخدم أو كلمة المرور غير صحيحة."},401);
  return json({error:"تعذر إكمال الطلب. راجع إعدادات Supabase أو حاول لاحقًا."},400);
 }
}
