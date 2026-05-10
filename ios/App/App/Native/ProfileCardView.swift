import SwiftUI

struct ProfileCardData: Equatable {
    let userId: String
    let displayName: String
    let username: String
    let avatarURL: String?
    var photoURLs: [String]
    var interestNames: [String]
    var bio: String?
}

struct ProfileCardView: View {
    @State var data: ProfileCardData
    let onOpenProfile: (String) -> Void
    let onSayHi: (String) -> Void
    let onClose: () -> Void

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                avatarView
                    .frame(width: 56, height: 56)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(data.displayName.isEmpty ? data.username : data.displayName)
                        .font(.title3).bold()
                        .lineLimit(1)
                    if !data.username.isEmpty {
                        Text("@\(data.username)").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.tertiary)
                }
            }

            if !data.photoURLs.isEmpty {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(Array(data.photoURLs.prefix(6).enumerated()), id: \.offset) { _, urlString in
                        AsyncImage(url: URL(string: urlString)) { phase in
                            switch phase {
                            case .empty: Color.secondary.opacity(0.1)
                            case .success(let img): img.resizable().scaledToFill()
                            case .failure: Color.secondary.opacity(0.1)
                            @unknown default: Color.secondary.opacity(0.1)
                            }
                        }
                        .frame(height: 96)
                        .clipped()
                        .cornerRadius(12)
                    }
                }
            }

            if !data.interestNames.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(data.interestNames.prefix(3), id: \.self) { name in
                            Text(name)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.secondary.opacity(0.12))
                                .clipShape(Capsule())
                        }
                    }
                }
            }

            if let bio = data.bio, !bio.isEmpty {
                Text(bio).font(.body).foregroundStyle(.secondary).lineLimit(4)
            }

            HStack(spacing: 12) {
                Button {
                    onSayHi(data.userId)
                } label: {
                    Label("Say hi", systemImage: "hand.wave")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                Button {
                    onOpenProfile(data.userId)
                } label: {
                    Label("Profile", systemImage: "person.crop.circle")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.secondary.opacity(0.12))
                        .foregroundColor(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(20)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var avatarView: some View {
        if let urlString = data.avatarURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: initialView
                }
            }
        } else {
            initialView
        }
    }

    private var initialView: some View {
        ZStack {
            Color.accentColor.opacity(0.2)
            Text(initial).font(.title3).bold()
        }
    }

    private var initial: String {
        let source = data.displayName.isEmpty ? data.username : data.displayName
        return String(source.prefix(1)).uppercased()
    }
}
