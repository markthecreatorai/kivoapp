
create table product_reviews (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products(id) on delete cascade not null,
  author_name text not null,
  author_avatar_url text,
  rating integer not null check (rating >= 1 and rating <= 5),
  content text not null,
  is_approved boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table product_reviews enable row level security;

create policy "Reviews are viewable by everyone" 
  on product_reviews for select 
  using (true);

create policy "Users can insert reviews for their products" 
  on product_reviews for insert 
  with check (
    auth.uid() IN (
      SELECT wm.user_id FROM workspace_members wm
      JOIN products p ON p.workspace_id = wm.workspace_id
      WHERE p.id = product_id
    )
  );

create policy "Users can update reviews for their products" 
  on product_reviews for update 
  using (
    auth.uid() IN (
      SELECT wm.user_id FROM workspace_members wm
      JOIN products p ON p.workspace_id = wm.workspace_id
      WHERE p.id = product_id
    )
  );

create policy "Users can delete reviews for their products" 
  on product_reviews for delete 
  using (
    auth.uid() IN (
      SELECT wm.user_id FROM workspace_members wm
      JOIN products p ON p.workspace_id = wm.workspace_id
      WHERE p.id = product_id
    )
  );
