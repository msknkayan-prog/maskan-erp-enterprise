import {saudiDate} from './modules.mjs';

export function iqamaAlert(value, day = saudiDate()) {
 const date = String(value || '').slice(0, 10);
 const expiry = Date.parse(date + 'T00:00:00Z');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(expiry) || new Date(expiry).toISOString().slice(0, 10) !== date) {
  return {key: 'unknown', days: Infinity, label: 'غير محددة', color: '#747b76'};
 }
 const days = (expiry - Date.parse(day + 'T00:00:00Z')) / 86400000;
 if (days < 0) return {key: 'expired', days, label: 'منتهية', color: '#8B1820'};
 if (days <= 30) return {key: 'urgent', days, label: days === 0 ? 'تنتهي اليوم' : 'تجديد عاجل', color: '#D83B36'};
 if (days < 60) return {key: 'warning', days, label: 'قرب الانتهاء', color: '#946800'};
 if (days <= 90) return {key: 'watch', days, label: 'متابعة', color: '#747b76'};
 return {key: 'valid', days, label: 'سارية', color: '#22864A'};
}

export function matchesIqamaFilter(employee, filter, day) {
 const status = iqamaAlert(employee.data?.iqama_expiry, day).key;
 if (filter === 'due_soon' || filter === 'expired') {
  return !employee.data?._deleted && status === (filter === 'due_soon' ? 'urgent' : 'expired');
 }
 return status === filter;
}
