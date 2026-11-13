const normalizedEmail=value=>String(value||'').trim().toLowerCase();

// Project selection is independent from credentials. Credentials are validated
// when saving, so a new manager can choose projects before entering an email.
export function canSelectManagerProject(project,employeeCompany=''){
 return project?.module==='projects'&&(!employeeCompany||project.company===employeeCompany);
}

export function managerReassignmentConflicts(projects,selectedIds,managerEmail){
 const ids=new Set(selectedIds);
 const email=normalizedEmail(managerEmail);
 return projects.filter(project=>{
  const assigned=normalizedEmail(project?.data?.manager_email);
  return ids.has(project.id)&&assigned&&assigned!==email;
 });
}
