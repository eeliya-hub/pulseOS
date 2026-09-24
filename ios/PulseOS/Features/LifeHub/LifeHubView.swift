import SwiftUI

/// Life Hub — the planning section.
///
/// The web puts Schedule, To-do + Habits, and Projects in three ground columns
/// at once. Those become four tabs here, with the day's counts kept in the hero
/// so the summary the web gives you at a glance is not lost to the tabs.
struct LifeHubView: View {
    @EnvironmentObject private var sky: SkyModel

    enum Tab: Hashable { case schedule, todo, habits, projects }
    @State private var tab: Tab = .schedule
    @State private var todos = Sample.todos
    @State private var habits = Sample.habits

    private var today: [Sample.Entry] {
        Sample.schedule.filter { Calendar.current.isDateInToday($0.start) }
    }

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Today")
                    .font(PulseFont.eyebrow)
                    .foregroundStyle(sky.phase.accent.opacity(0.85))
                Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                    .font(PulseFont.hero(32))
                    .foregroundStyle(Theme.moon)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                HStack(spacing: 18) {
                    count("\(today.count)", "events")
                    count("\(todos.filter { !$0.done }.count)", "to-do")
                    count("\(habits.filter(\.done).count)/\(habits.count)", "habits")
                }
                .padding(.top, 2)
            }
        } ground: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SegTabs(
                        items: [(.schedule, "Schedule"), (.todo, "To-do"),
                                (.habits, "Habits"), (.projects, "Projects")],
                        selection: $tab,
                        accent: sky.phase.accent
                    )

                    switch tab {
                    case .schedule: schedule
                    case .todo: todoList
                    case .habits: habitList
                    case .projects: projectList
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func count(_ value: String, _ label: String) -> some View {
        HStack(spacing: 5) {
            Text(value)
                .font(PulseFont.hero(20))
                .foregroundStyle(Theme.moon)
            Text(label)
                .font(PulseFont.meta)
                .foregroundStyle(Theme.dim)
        }
    }

    private var schedule: some View {
        VStack(spacing: 0) {
            ForEach(Array(Sample.schedule.enumerated()), id: \.element.id) { i, entry in
                GroundRow(
                    lead: entry.allDay ? "All day" : entry.start.formatted(date: .omitted, time: .shortened),
                    subLead: entry.end.map { $0.formatted(date: .omitted, time: .shortened) },
                    title: entry.title,
                    subtitle: [entry.location, entry.calendar].compactMap { $0 }.joined(separator: " · "),
                    tint: entry.tint
                )
                if i < Sample.schedule.count - 1 { Hairline() }
            }
        }
    }

    private var todoList: some View {
        VStack(spacing: 0) {
            ForEach($todos) { $task in
                Button {
                    withAnimation(.snappy(duration: 0.2)) { task.done.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 19, weight: .light))
                            .foregroundStyle(task.done ? sky.phase.accent : Theme.moon.opacity(0.35))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title)
                                .font(PulseFont.title)
                                .foregroundStyle(Theme.moon.opacity(task.done ? 0.4 : 0.94))
                                .strikethrough(task.done, color: Theme.moon.opacity(0.4))
                            if let note = task.note {
                                Text(note)
                                    .font(PulseFont.meta)
                                    .foregroundStyle(Theme.dim)
                            }
                        }
                        Spacer()
                    }
                    .padding(.vertical, 11)
                }
                .buttonStyle(.plain)
                Hairline()
            }

            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .medium))
                Text("Add a task")
                    .font(PulseFont.body)
                Spacer()
            }
            .foregroundStyle(Theme.moon.opacity(0.45))
            .padding(.vertical, 13)
        }
    }

    private var habitList: some View {
        VStack(spacing: 10) {
            ForEach($habits) { $habit in
                Pane(padding: 13) {
                    HStack(spacing: 12) {
                        Button {
                            withAnimation(.snappy(duration: 0.2)) { habit.done.toggle() }
                        } label: {
                            Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 21, weight: .light))
                                .foregroundStyle(habit.done ? sky.phase.accent : Theme.moon.opacity(0.35))
                        }
                        .buttonStyle(.plain)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(habit.title)
                                .font(PulseFont.title)
                                .foregroundStyle(Theme.moon.opacity(habit.done ? 0.55 : 0.94))
                            Text("\(habit.streak) day streak")
                                .font(PulseFont.meta)
                                .foregroundStyle(Theme.dim)
                        }
                        Spacer()
                        // The streak is the number the web emphasises, so it
                        // stays a figure rather than becoming a badge.
                        Text("\(habit.streak)")
                            .font(PulseFont.hero(22))
                            .foregroundStyle(habit.done ? sky.phase.accent : Theme.moon.opacity(0.5))
                    }
                }
            }
        }
    }

    private var projectList: some View {
        VStack(spacing: 12) {
            ForEach(Sample.projects) { project in
                Pane {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(project.title)
                                .font(PulseFont.titleLarge)
                                .foregroundStyle(Theme.moon)
                            Spacer()
                            Text("\(project.tasks.filter(\.done).count) of \(project.tasks.count)")
                                .font(PulseFont.meta)
                                .foregroundStyle(Theme.dim)
                        }

                        // Progress reads before the task list does — same as
                        // the web, where the bar sits under the project name.
                        GeometryReader { geo in
                            let done = Double(project.tasks.filter(\.done).count)
                            let total = Double(max(project.tasks.count, 1))
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.08))
                                Capsule().fill(project.tint)
                                    .frame(width: geo.size.width * (done / total))
                            }
                        }
                        .frame(height: 3)

                        VStack(spacing: 0) {
                            ForEach(project.tasks) { task in
                                HStack(spacing: 10) {
                                    Image(systemName: task.done ? "checkmark" : "circle")
                                        .font(.system(size: task.done ? 11 : 13, weight: .medium))
                                        .foregroundStyle(task.done ? project.tint : Theme.moon.opacity(0.3))
                                        .frame(width: 16)
                                    Text(task.title)
                                        .font(PulseFont.body)
                                        .foregroundStyle(Theme.moon.opacity(task.done ? 0.42 : 0.88))
                                        .strikethrough(task.done, color: Theme.moon.opacity(0.4))
                                    Spacer()
                                }
                                .padding(.vertical, 5)
                            }
                        }
                    }
                }
            }
        }
    }
}
