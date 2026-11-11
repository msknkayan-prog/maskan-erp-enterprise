// Company identity is selected by the exact company key, never by a generic fallback.
// Brand marks for other companies are intentionally blank until an authorized logo is uploaded.
export function companyLogoPath(company,profiles){
 const profile=profiles.find(r=>r.module==='company_profiles'&&r.company===company);
 const id=String(profile?.data?.logo_file_id||'');
 if(/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))return '/api/files?id='+encodeURIComponent(id)+'&logo=1';
 return company==='مسكن الكيان'?'/maskan-logo.jpg':'';
}
export function companyOfficialName(company,profiles){
 const profile=profiles.find(r=>r.module==='company_profiles'&&r.company===company);
 return profile?.data?.name|| (company==='مسكن الكيان'?'شركة مسكن الكيان للمقاولات':company);
}
