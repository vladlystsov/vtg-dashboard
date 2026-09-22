import type { EduProject } from './eduProject';

// Заглушки для раздела «Выбор проектов» (Проектное обучение УрФУ).
// Заполняются реальными данными после обновления на istudent.urfu.ru.
export const EDU_PROJECT_PLACEHOLDERS: Omit<EduProject, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Заглушка: Веб-сервис для университета',
    selectionStart: '2026-09-22T10:00:00',
    selectionDeadline: '2026-09-23T10:00:00',
    customer: 'Иванов Иван Иванович',
    customerEmail: 'i.ivanov@example.ru',
    organization: 'ООО Пример',
    curator: 'Куратор 1',
    direction: 'Веб',
    placesLeft: 5,
    placesTotal: 5,
    teamsCount: 1,
    status: 'Запись не началась',
    programType: 'прикладной',
    programManager: 'Программный руководитель 1',
    target: 'Разработка веб-приложения.',
    result: 'Работающий веб-сервис.',
  },
  {
    name: 'Заглушка: Игровой проект',
    selectionStart: '2026-09-22T10:00:00',
    selectionDeadline: '2026-09-23T10:00:00',
    customer: 'Петров Пётр Петрович',
    customerEmail: 'p.petrov@example.ru',
    organization: 'ООО Геймдев',
    curator: 'Куратор 2',
    direction: 'Игра',
    placesLeft: 3,
    placesTotal: 10,
    teamsCount: 2,
    status: 'Запись не началась',
    programType: 'прикладной',
    programManager: 'Программный руководитель 2',
    target: 'Создание прототипа игры.',
    result: 'Играбельный прототип.',
  },
];