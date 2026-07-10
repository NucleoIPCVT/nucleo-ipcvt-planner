export const people = [
  'Alexandre', 'Allysson', 'Amanda', 'Angelo', 'Arlete', 'Artur', 'Daiane',
  'Elton', 'Erick', 'Flávio', 'Gabi', 'Germano', 'Guilherme', 'Hudson',
  'Isadora', 'Jamylle', 'Jean Lucas', 'João Victor', 'Kauã', 'Laura',
  'Liliane', 'Lorran', 'Lucas', 'Manuela', 'Mônica', 'Nilson',
  'Pastor Eduardo', 'Pedro', 'Roberta', 'Rodrigo', 'Samuel', 'Victor',
  'Vitória'
].map((name) => ({
  id: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'),
  name,
  status: 'ativo',
}))
